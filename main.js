// read file
var data, attrList = {}, tm, totalSize, binNum = 10, numAttrs = [];
var hiddenFileLoader = $('input#fileHide');

$('button#file').click(function() {
    hiddenFileLoader.trigger('click');
});

// load file and initialize visualization
hiddenFileLoader.change(function(event) {
    var file = event.target.files[0];
    if (file) {
        var reader = new FileReader();
        reader.onload = function(event) {
            var inter = event.target.result;
            Papa.parse(inter, {
                header: true,
                dynamicTyping: true,
                complete: function(results) {
                    totalSize = results.data.length;
                    var rootDM = new dataManager(results.data);
                    var header = rootDM.getHeaderList(), corrM = [];

                    // create attribute widgets
                    header.forEach(function(obj) {
                        attrList[obj] = new attrManager(obj, rootDM.getColumn(obj));
                        attrList[obj].createWidget();
                        if (attrList[obj].type == 'number') numAttrs.push(obj);
                    });

                    // create correlation and scatterplot widget
                    rootDM.heatmap();
                    rootDM.scatter();

                    // build tree
                    tm = new treeManager()
                    tm.addNode('Whole', 'root', 'corr', rootDM);    // add root node
                    tm.update();
                    tm.selectNode(rootDM.node); // root node is initially selected
                }
            });
        }
        reader.readAsText(file);
    }
});

/**
 * Data manager class
 * @param {*} input parsed data from csv
 */
var dataManager = function(data, xAttr=undefined, yAttr=undefined) {
    this.data = data;
    this.ratio = data.length / totalSize;
    this.header = Object.keys(data[0]);
    this.xAttr = xAttr;
    this.yAttr = yAttr;
    this.zAttr;
    this.corr = xAttr == undefined ? undefined : this.pearsonCorr(xAttr, yAttr);
    this.node;
    this.zValues;
    this.gaps;
    this.colormap = d3.scale.linear().domain([-1,1])
                    .interpolate(d3.interpolateRgb)
                    .range(['blue', 'red']);
    this.table = new tableManager(this.data, this.header);

    dataManager.prototype.getHeaderList = function() {
        return this.header;
    };

    dataManager.prototype.getColumn = function(attr) {
        return this.data.map(function(obj) {
            return obj[attr];
        });
    };

    dataManager.prototype.partialCorrelation = function(z, type, x=undefined, y=undefined) {
        var dm = this, xAttr = x == undefined ? this.xAttr : x, yAttr = y == undefined ? this.yAttr : y;
        if (z == x || z == y)
            return 'nv';
        if (type == 'number') {
            var roxy = this.pearsonCorr(xAttr, yAttr),
                roxz = this.pearsonCorr(xAttr, z),
                royz = this.pearsonCorr(yAttr, z);

            var p1 = (roxy - roxz * royz), p2 = (1 - roxz * roxz), p3 = (1 - royz * royz);
            p2 = p2 == 0 ? 0.01 : p2;
            p3 = p3 == 0 ? 0.01 : p3;
            var result = p1 / Math.sqrt(p2 * p3);
            return result;
        }
        else {
            // get groups of data by z
            var groups = this.data.groupBy(z);
            var result = 0;
            for (var key in groups) {
                var mux = 0, muy = 0, cov = 0, sdx = 0, sdy = 0, roxy, len = groups[key].length;
                groups[key].forEach(function(obj) {
                    mux += obj[xAttr];
                    muy += obj[yAttr];
                });

                mux = mux / len;
                muy = muy / len;

                groups[key].forEach(function(obj) {
                    var vx = obj[xAttr], vy = obj[yAttr];
                    cov += (vx - mux) * (vy - muy);
                    sdx += (vx - mux) * (vx - mux);
                    sdy += (vy - muy) * (vy - muy);
                });

                if (sdx == 0 || sdy == 0) roxy = 0;
                else roxy = cov / Math.sqrt(sdx * sdy);
                result += roxy * len;
            }

            return result / this.data.length;
        }
    };

    dataManager.prototype.pearsonCorr = function(f1, f2, data=undefined) {
        var mu1 = 0, mu2 = 0, cov = 0, sd1 = 0, sd2 = 0, 
            usedData = data == undefined ? this.data : data,
            list = usedData.map(function(obj) {
                var v1 = obj[f1], v2 = obj[f2];
                mu1 += v1;
                mu2 += v2;
                return [v1, v2];
            }),
            len = list.length;
        
        mu1 = mu1 / len;
        mu2 = mu2 / len;
        
        list.forEach(function(obj) {
            var v1 = obj[0], v2 = obj[1];
            cov += (v1 - mu1) * (v2 - mu2);
            sd1 += (v1 - mu1) * (v1 - mu1);
            sd2 += (v2 - mu2) * (v2 - mu2);
        });
    
        if (sd1 == 0 || sd2 == 0) return 0;
        return cov / Math.sqrt(sd1 * sd2);
    };

    dataManager.prototype.colormap = function(pc) {
        return this.colormap(pc);
    };

    dataManager.prototype.heatmap = function() {
        // initial the data
        var dm = this;
        var xValues = yValues = numAttrs;
        if (this.zValues == undefined) {
            this.zValues = numAttrs.map(function(obj1) {
                return numAttrs.map(function(obj2) {
                    var corr = dm.pearsonCorr(obj1, obj2);
                    return corr;
                });
            });
        } 
        var zValues = this.zValues;
        
        if (this.gaps == undefined) {
            this.gaps = numAttrs.map(function(obj1) {
                var x = numAttrs.indexOf(obj1);
                return numAttrs.map(function(obj2) {
                    var y = numAttrs.indexOf(obj2)
                    var corr = zValues[x][y], result = 0, gap;
                    dm.header.forEach(function(obj3) {
                        if (obj3 == obj1 || obj3 == obj2) return;
                        var pcorr = dm.partialCorrelation(obj3, attrList[obj3].type, obj1, obj2);
                        if (Math.abs(pcorr - corr) >= Math.abs(result)) result = pcorr;
                    });
                    return result;
                });
            });
        }
        var gaps = this.gaps;

        // initialize the title color of attribute widgets
        var dm = this;
        this.xAttr = this.xAttr == undefined ? xValues[0] : this.xAttr;
        this.yAttr = this.yAttr == undefined ? yValues[yValues.length - 1] : this.yAttr;
        this.header.forEach(function(obj) {
            if (obj == dm.xAttr || obj == dm.yAttr)
                attrList[obj].disableWidget();
            else {
                var pc = dm.partialCorrelation(obj, attrList[obj].type);
                attrList[obj].enableWidget(dm.colormap(pc), pc);
            }
        });

        var data = [{
            x: xValues,
            y: yValues,
            z: zValues,
            zmin: -1,
            zmax: 1,
            type: 'heatmap',
            colorscale: 'Bluered'
        }];
        var layout = {
            annotations: [],
            xaxis: {
                ticks: '',
            },
            yaxis: {
                ticks: '',
                autosize: true
            },
            margin: {
                l: 60,
                r: 10,
                b: 50,
                t: 20,
                pad: 0
            }
        };
        var config = {
            displayModeBar: false,
            responsive: true
        }

        numAttrs.forEach(function(obj1) {
            numAttrs.forEach(function(obj2) {
                var x = numAttrs.indexOf(obj1), y = numAttrs.indexOf(obj2);
                var color = dm.colormap(gaps[x][y]);
                layout.annotations.push({
                    x: x,
                    y: y,
                    yshift: 3,
                    text: '\u25CF',
                    showarrow: false,
                    font: {
                        size: 38,
                        color: color
                    }
                })
            });
        });
        layout.annotations.push({
            x: this.xAttr,
            y: this.yAttr,
            text: '',
            bordercolor: 'yellow',
            borderpad: 16,
            borderwidth: 2,
            showarrow: false,
        });

        Plotly.newPlot('corr', data, layout, config);
        this.corr = this.pearsonCorr(this.xAttr, this.yAttr);

        // click event response
        document.getElementById('corr').on('plotly_click', function(data) {
            for (var i = 0; i < data.points.length; i++) {
                // update heatmap
                var selectPoint = data.points[i];
                if (selectPoint.x == selectPoint.y) continue;

                dm.xAttr = selectPoint.x;
                dm.yAttr = selectPoint.y;
                dm.corr = selectPoint.z;
                layout.annotations.pop();
                layout.annotations.push({
                    x: selectPoint.x,
                    y: selectPoint.y,
                    text: '',
                    bordercolor: 'yellow',
                    borderpad: 16,
                    borderwidth: 2,
                    showarrow: false,
                });
                Plotly.relayout('corr', layout);

                // update scatterplot
                dm.scatter();

                // update attribute widgets
                dm.header.forEach(function(obj) {
                    if (obj == selectPoint.x || obj == selectPoint.y)
                        attrList[obj].disableWidget();
                    else {
                        var pc = dm.partialCorrelation(obj, attrList[obj].type);
                        attrList[obj].enableWidget(dm.colormap(pc), pc);
                    }
                });

                // update tree node
                dm.updateNode();
            }
        });
    };

    dataManager.prototype.scatter = function(z=undefined) {
        // show filter
        $('div#filterContainer').css('display', 'block');
        var filter = $('div#filter');
        filter.empty();
        var resultRange;
        var dm = this;

        // draw scatter plot
        var sortF = function(a, b) {return a - b;},
            xValues = this.getColumn(this.xAttr), 
            yValues = this.getColumn(this.yAttr),
            zValues = z == undefined ? undefined : this.getColumn(z),
            xMin = Math.min.apply(Math, xValues) - 1, xMax = Math.max.apply(Math, xValues) + 1,
            yMin = Math.min.apply(Math, yValues) - 1, yMax = Math.max.apply(Math, yValues) + 1;

        var trace = {
            x: xValues,
            y: yValues,
            mode: 'markers',
            type: 'scatter',
            marker: {
                opacity: 0.5,
                size: 5
            },
            transforms: []
        };
        var data = [trace];
        var layout = {
            margin: {
                l: 70,
                r: 20,
                b: 70,
                t: 20,
                pad: 0
            },
            hovermode:'closest',
            uirevision: Math.random(),
            xaxis: {
                range: [xMin, xMax],
                zeroline:false, 
                title: dm.xAttr
            },
            yaxis: {
                range: [yMin, yMax],
                zeroline:false, 
                title: dm.yAttr
            }
        };
        var config = {
            displayModeBar: false,
            responsive: true
        }
        if ($('div#scatter').children().length > 0) Plotly.react('scatter', data, layout, config);
        else Plotly.newPlot('scatter', data, layout, config); 
        
        // if z attribute is added, enable filter function
        if (z != undefined) {
            var sample = zValues[0], zVoc = Array.from(new Set(zValues));
            var selectData, restData, name;

            if (zVoc.length > binNum && typeof sample === 'number') { // continuous case
                var zMin = Math.min.apply(Math, zValues), zMax = Math.max.apply(Math, zValues);
                var slider = $('<div style="margin: 30px 30px 30px auto; height: calc(100% - 60px);"></div>');
                filter.append(slider);

                noUiSlider.create(slider.get(0), {
                    range: {
                        'min': zMin,
                        'max': zMax
                    },
                    step: 1,
                    margin: 1,
                    start: [zMin, zMax],
                    connect: true,
                    orientation: 'vertical',
                    behaviour: 'tap-drag',
                    direction: 'rtl',
                    tooltips: true,
                    format: wNumb({
                        decimals: 0
                    }),
                    pips: {
                        mode: 'range',
                        density: 10
                    }
                });

                slider.get(0).noUiSlider.on('update', function() {
                    var range = this.get();
                    trace.transforms.pop();
                    trace.transforms.push({
                        type: 'filter',
                        target: zValues,
                        operation: '[]',
                        value: range
                    });
                    Plotly.react('scatter', data, layout, config);
                    resultRange = range;

                    // get the selected and rest data
                    selectData =[], restData = [];
                    dm.data.forEach(function(obj) {
                        if (obj[z] >= resultRange[0] && obj[z] <= resultRange[1])
                            selectData.push(obj);
                        else
                            restData.push(obj);
                    });
                    name = resultRange[0] + ' ~ ' + resultRange[1];
                    var pcorr = Math.round(dm.pearsonCorr(dm.xAttr, dm.yAttr, selectData) * 100) / 100;
                    var color = dm.colormap(pcorr);
                    var corrState = $('div.title#corrState');
                    corrState.text('PC = ' + pcorr);
                    corrState.css('background', color);
                });

            } else { // discrete case
                zVoc.sort();
                zVoc.forEach(function(obj) { // add all legends
                    var legend = $('<div class="legendDis" id="id' + obj + '">&#9679&nbsp' + obj + '</div>');
                    legend.data('select', false);
                    legend.data('value', obj)
                    filter.append(legend);

                    legend.on('click', function() {
                        trace.transforms.pop();
                        if ($(this).data('select')) {
                            $(this).data('select', false);
                            $(this).css('color', 'black');
                            resultRange = undefined;
                        } else {
                            var value = $(this).data('value');
                            $('div.legendDis').each(function() {
                                $(this).data('select', false);
                                $(this).css('color', 'black');
                            });
                            $(this).data('select', true);
                            $(this).css('color', 'red');
                            trace.transforms.push({
                                type: 'filter',
                                target: zValues,
                                operation: '=',
                                value: value
                            })
                            resultRange = value;
                        }
                        Plotly.react('scatter', data, layout, config);

                        // get the selected and rest data
                        selectData =[], restData = [];
                        dm.data.forEach(function(obj) {
                            if (obj[z] == resultRange)
                                selectData.push(obj);
                            else
                                restData.push(obj);
                        });
                        name = resultRange;
                        var pcorr = Math.round(dm.pearsonCorr(dm.xAttr, dm.yAttr, selectData) * 100) / 100;
                        var color = dm.colormap(pcorr);
                        var corrState = $('div.title#corrState');
                        corrState.text('PC = ' + pcorr);
                        corrState.css('background', color);
                    });
                });
            }

            // submit filtering result to the tree
            $('div#submit').off('click');
            $('div#submit').click(function() {
                if (resultRange != undefined) {
                    // grow the tree
                    var x = dm.xAttr, y = dm.yAttr,
                        selectDM = new dataManager(selectData, x, y),
                        restDM = new dataManager(restData, x, y);
                         // get id of the parent node

                    if (dm.node.text.name == 'Rest') {
                        var parentid = dm.node.parentid;
                        var parentNode = tm.getNode(parentid);
                        if (parentNode.text.name == '< attr:' + z + ' >') {
                            tm.removeNode(dm.node.currentid);
                            tm.addNode(name, parentid, 'corr', selectDM);
                            tm.addNode('Rest', parentid, 'corr', restDM);
                        } else {
                            var currentid = dm.node.currentid;
                            var attrParentid = tm.addNode('< attr:' + z + ' >', currentid, 'attr', '');
                            tm.addNode(name, attrParentid, 'corr', selectDM);
                            tm.addNode('Rest', attrParentid, 'corr', restDM);
                        }
                    } else {
                        var parentid = dm.node.currentid;
                        var attrParentid = tm.addNode('< attr:' + z + ' >', parentid, 'attr', '');
                        tm.addNode(name, attrParentid, 'corr', selectDM);
                        tm.addNode('Rest', attrParentid, 'corr', restDM);
                    }
                    tm.update();
                }
            });
        }
    };

    dataManager.prototype.setNode = function(node) {
        this.node = node;
    };

    dataManager.prototype.updateNode = function() {
        var color = this.colormap(this.corr);
        var id = $(this.node.innerHTML).attr('id');
        var detail = $('div#' + id).find('div.childDetail');
        var bar = $('div#' + id).find('div.childBar');
        var name = this.node.text.name;

        // update node color
        detail.css('background-color', color);

        // update node context
        detail.html(name + ' (' + (Math.round(this.corr * 100) / 100) + ')' + '<br>' + this.xAttr + '-' + this.yAttr);

        // update bar length
        var ratio = this.ratio * 100;
        bar.css('width', '' + ratio + '%');

        // hide corr state
        $('div#corrState').css('background', 'white');
    };

    dataManager.prototype.setZAttr = function(attr){
        this.zAttr = attr;
    };
}

/**
 * Attribute manager class
 * @param {*} name attribute name
 * @param {*} data attribute data
 */
var attrManager = function(name, data) {
    this.name = name;
    this.data = data;
    this.container = $('div#attrs');
    this.domElement;
    this.type;
    this.titleContainer;
    this.detailContainer;
    this.widgetContainer;
    this.titleColor;

    attrManager.prototype.typer = function() {
        var sample = this.data[0];
        // var uniqueRatio = Array.from(new Set(this.data)).length / this.data.length;
        // return typeof sample == "number" ? "number" : (uniqueRatio >= 0.5 ? 'text' : 'category');
        return typeof sample == "number" ? "number" : 'category';
    };

    attrManager.prototype.createWidget = function() {
        // detect data type
        var am = this;
        this.type = this.typer();
        if (this.type == 'number') typeSign = '<i class="fas fa-chart-bar"></i>';
        else if (this.type == 'category') typeSign = '<i class="fas fa-chart-pie"></i>';
        else typeSign = '<i class="fas fa-font"></i>';
    
        // add widget element
        var widgetElement = $('<div class="attrWidget" id="attr' + this.name + '"></div>'),
            widgetTitle = $('<div class="attrTitle" id="attr' + this.name + '"></div>'),
            widgetDetail = $('<div class="attrDetail" id="attr' + this.name + '"></div>');
        widgetElement.append(widgetTitle);
        widgetElement.append(widgetDetail);
        this.container.append(widgetElement);
        this.widgetContainer = widgetElement.get(0);
        this.titleContainer = widgetTitle.get(0);
        this.detailContainer = widgetDetail.get(0);
    
        // add widget content
        widgetTitle.html(typeSign + '&nbsp&nbsp' + this.name);
        if (this.type == 'number') this.hist();
        else if (this.type == 'category') {
            this.pie();
        }

        // add response to title click event
        widgetTitle.on('click', function() {
            var state = $(this).data('state');
            if (state != 'disable') {
                // recover the previous highlight widget if exist
                Object.keys(attrList).forEach(function(obj) {
                    var widget = attrList[obj];
                    var state = $(widget.titleContainer).data('state');
                    if (state == 'highlight') {
                        $(widget.titleContainer).data('state', 'enable')
                        widget.enableWidget();
                    }
                });

                // highlight clicked widget
                am.highlightWidget();
                var dm = tm.selectedNode.dManager;
                var id = $(this).attr('id').split('attr')[1];
                dm.scatter(id); // update scatter plot

                // hide corr state
                $('div#corrState').css('background', 'white');
            };
        });
    };

    attrManager.prototype.disableWidget = function() {
        var title = $(this.titleContainer), html = title.html();

        // update the title
        html = html.split('(');
        if (html.length > 1) {
            html = html[0]
            title.html(html);
        }
        title.data('state', 'disable');
        title.css('background-color', 'black');

        // recover highlight style
        var widget = $(this.widgetContainer);
        widget.css('border-top', '');
        widget.css('border-bottom', '');
        widget.css('margin-top', '');
        widget.css('margin-bottom', '');

        // update grayscale of widget detail
        // $(this.detailContainer).css('filter', 'grayscale(100%)');
        $(this.detailContainer).css('filter', 'invert(100%)');
    };

    attrManager.prototype.highlightWidget = function() {
        var widget = $(this.widgetContainer), title = $(this.titleContainer);
        title.data('state', 'highlight');
        widget.css('border-top', '10px solid #686868');
        widget.css('border-bottom', '10px solid #686868');
        widget.css('margin-top', '30px');
        widget.css('margin-bottom', '30px');
    };

    attrManager.prototype.enableWidget = function(color, pc) {
        var title = $(this.titleContainer), html = title.html();
        var widget = $(this.container);
        pc = Math.round(pc * 100) / 100;

        // update the title
        html = html.split('(');
        if (html.length > 1) 
            html = html[0] + '(PC = ' + pc + ')';
        else 
            html += ' (PC = ' + pc + ')';
        title.html(html);
        title.data('state', 'enable');
        title.css('background-color', color);

        // recover highlight style
        var widget = $(this.widgetContainer);
        widget.css('border-top', '');
        widget.css('border-bottom', '');
        widget.css('margin-top', '');
        widget.css('margin-bottom', '');

        // update grayscale of widget detail
        $(this.detailContainer).css('filter', '');
    }

    attrManager.prototype.hist = function() {
        var trace = {
            x: this.data,
            type: 'histogram'
        };
        var data = [trace];
        var layout = {
            margin: {
                l: 20,
                r: 10,
                b: 30,
                t: 20,
                pad: 0
            },
            font: {
                size: 10
            },
            bargap: 0.1
        }
        var config = {
            displayModeBar: false
        }
        Plotly.newPlot(this.detailContainer, data, layout, config);
    };

    attrManager.prototype.pie = function() {
        var labels = Array.from(new Set(this.data)), values = {};
        labels.forEach(function(obj) {
            values[obj] = 0;
        });
        this.data.forEach(function(obj) {
            values[obj] += 1;
        });
        values = labels.map(function(obj) {
            return values[obj]
        });
    
        var data = [{
            values: values,
            labels: labels,
            type: 'pie',
            textinfo: 'none'
        }];
        var layout = {
            margin: {
                l: 5,
                r: 5,
                b: 5,
                t: 5,
                pad: 0
            },
            font: {
                size: 10
            },
        }
        var config = {
            displayModeBar: false
        }
        Plotly.newPlot(this.detailContainer, data, layout, config);
    };
}

/**
 * Tree manager class
 */
var treeManager = function() {
    var tm = this;
    this.config = {
        container: '#tree',
        // rootOrientation: 'WEST',
        nodeAlign: 'BOTTOM',
        connectors: {
            type: 'step',
            style: {
                stroke: 'black',
                'stroke-width': 2,
                // 'arrow-end': 'right'
            }
        },
        // node: {
        //     collapsable: true
        // },
        callback: {
            onTreeLoaded: function(d) {
                $('div.childNode').click(function(){
                    // select the node to be clicked
                    var id = parseInt($(this).attr('id').split('no')[1]);
                    var node = tm.cloneArray[id];
                    tm.selectNode(node);
                });
            }
        }
    };
    this.cloneArray = [this.config]; // keep apparent tree structure
    this.nodeList = [this.config]; 
    this.selectedNode = null;
    $('div#tree').css('background-color', 'white');

    treeManager.prototype.selectNode = function(node) {
        this.selectedNode = node, dm = node.dManager;
        var selectedid = $(node.innerHTML).attr('id');
        $('div.childNode').each(function() {
            var id = $(this).attr('id');
            if (id == selectedid)
                $(this).css('border', '2px solid red');
            else
                $(this).css('border', '2px solid black');
        });
        dm.table.createTable();

        if (this.cloneArray.length <= 2) return;

        // update all the other widgets
        var header = dm.getHeaderList();
        $('div#attrs').empty();
        header.forEach(function(obj) {
            attrList[obj] = new attrManager(obj, dm.getColumn(obj));
            attrList[obj].createWidget();
        });
        dm.heatmap();
        dm.scatter();
        $('div#corrState').css('background', 'white');
    };

    treeManager.prototype.addNode = function(name, parentid, type, dm) {
        // parent should come from nodeList
        // create node
        var tm = this, currentid = this.cloneArray.length;
        var node = {
            parentid: parentid,
            currentid: currentid,
            text: {name: name},
            dManager: dm
        }
        if (type == 'corr') {
            node['innerHTML'] = '<div class="childNode" id="no' + this.cloneArray.length + '">';
            node['innerHTML'] += '<div class="childDetail">' + (name + '<br>' + dm.xAttr + '-' + dm.yAttr) + '</div>';
            node['innerHTML'] += '<div class="childBar"></div>';
            node['innerHTML'] += '</div>'
        }
        if (parentid != 'root')
            node['parent'] = this.cloneArray[parentid];
        if (dm != '')
            dm.setNode(node);

        // add node to the tree
        this.cloneArray.push(node);
        this.nodeList = this.cloneArray.map(function(obj) {
            return $.extend(true, {}, obj);
        });

        // remap parent
        this.nodeList.forEach(function(obj) {
            var parent = obj.parent;
            if (parent != undefined) {
                obj.parent = tm.nodeList[obj.parentid];
            }
        });

        // regenerate tree
        new Treant(this.nodeList);

        return currentid; // return current id
    };

    treeManager.prototype.removeNode = function(removeid) {
        this.cloneArray.splice(removeid, 1); // remove the node
        this.nodeList = this.cloneArray.map(function(obj) {
            return $.extend(true, {}, obj);
        });

        // remap parent
        this.nodeList.forEach(function(obj) {
            var parent = obj.parent;
            if (parent != undefined) {
                obj.parent = tm.nodeList[obj.parentid];
            }
        });
        
        // regenerate tree
        new Treant(this.nodeList);
    };

    treeManager.prototype.update = function() {
        this.cloneArray.forEach(function(obj) {
            // update all existing nodes
            if (obj.dManager != undefined) {
                if (obj.dManager instanceof dataManager)
                    obj.dManager.updateNode();
            }
        });

        if (this.selectedNode != null) this.selectNode(this.selectedNode);
    };

    treeManager.prototype.getNode = function(id) {
        return this.cloneArray[id];
    }
};

var tableManager = function(data, header) {
    this.data = data;
    this.header = header;
    this.container = $('div#table');
    this.tableContainer;

    tableManager.prototype.createTable = function() {
        // create table html
        this.container.css('background', 'white');
        this.container.css('border', '10px solid white');
        var html = '<table id="table_id" class="display" style="width:100%"><thead>';
        this.header.forEach(function(obj) {
            html += '<th>' + obj + '</th>'
        });
        html += '</thead><tbody>';

        var dLen = this.data.length, hLen = this.header.length;
        for (var i = 0; i < dLen; i++) {
            html += '<tr>';
            for (var j = 0; j < hLen; j++) {
                var head = this.header[j];
                var row = this.data[i];
                var value = row[head];
                html += '<td>' + value + '</td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        
        // create table
        var height = this.container.height();
        this.tableContainer = $(html);
        this.container.empty();
        this.container.append(this.tableContainer);
        this.tableContainer.DataTable({
            "scrollY": (height - 132) + "px",
            "scrollX": true
        });
    };
};

// array groupby function
Array.prototype.groupBy = function(prop) {
    return this.reduce(function(groups, item) {
        const val = item[prop]
        groups[val] = groups[val] || []
        groups[val].push(item)
        return groups
    }, {})
};