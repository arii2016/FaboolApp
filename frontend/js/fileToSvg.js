"use strict";


function FileToSvg()
{
    var PSD = require('psd');

    // -------------------------------------------------------------
    this.LoadToSvg = function(file, canvasFunc) {
        var reader = new FileReader();
        var ext = file['name'].slice(-4).toUpperCase();   // 拡張子

        if (ext == '.SVG') {
            // SVGの読み込み
            reader.onload = function(e) {
                var svgString = e.target.result;
                var colorArray = [];
                var strRet = svgToSvg(svgString, colorArray);
                var dpi = getSvgDpi(svgString);

                // 色の重複を削除
                colorArray = colorArray.filter(function (x, i, self) {
                                return self.indexOf(x) === i;
                            });

                canvasFunc(strRet, FILE_TYPE.SVG, dpi, colorArray);
            };
            reader.readAsText(file);
        }
        else if (ext == '.DXF') {
            // DXFの読み込み
            reader.onload = function(e) {
                var dxfString = e.target.result;
                var strRet = dxfToSvg(dxfString);

                canvasFunc(strRet, FILE_TYPE.DXF, 90);
            };
            reader.readAsText(file);
        }
        else if (ext == '.PSD') {
            // PSDの読み込み
            reader.onload = function(e) {
                var psd;
                psd = new PSD(new Uint8Array(e.target.result));
                psd.parse();

                var img = psd.image.toPng();
                var strRet = imgToSvg(img);

                canvasFunc(strRet, FILE_TYPE.IMG, 90);
            };
            reader.readAsArrayBuffer(file);
        }
        else if (ext == '.JPG' || ext == '.BMP' || ext == '.PNG' ||
                 ext == '.TIF' || ext == '.GIF') {

            //ファイルの読込が終了した時の処理
            reader.onload = function(e) {
                var img = new Image();

                img.onload = function(){
                    var strRet = imgToSvg(img);

                    canvasFunc(strRet, FILE_TYPE.IMG, 90);
                }

                img.src = e.target.result;

            }
            reader.readAsDataURL(file);     // dataURL形式でファイルを読み込む
        }
    };
    // -------------------------------------------------------------
    // SVGをSVGに変換
    var svgToSvg = function(svgString, colorArray) {
        // -------------------------------------------------------------
        var copyObj = function(strObj, obj, objColor, snap, color)
        {
            var segs;
            var d;
            var ctn;
            var matrix;
            var strokeWidth;

            // displayがnoneの場合は追加しない
            if (objColor.attr("display") == "none") {
                return;
            }

            // 色を取得、(色以外の場合は、黒にする)
            var stroke = objColor.attr("stroke");
            if (stroke.trim().slice(0, 3) != "rgb") {
                stroke = "rgb(0, 0, 0)";
            }
            color.push(stroke);

            // matrix取得
            ctn = obj.node.getScreenCTM();
            matrix = Snap.matrix(ctn.a, ctn.b, ctn.c, ctn.d, ctn.e, ctn.f);

            var minZoom;
            if (Math.abs(ctn.a) > Math.abs(ctn.d)) {
                minZoom = Math.abs(ctn.d);
            }
            else {
                minZoom = Math.abs(ctn.a);
            }
            strokeWidth = 0.7 / minZoom;

            if (strObj == "path") {
                snap.path(obj.attr("d")).attr({fill:"none", strokeWidth:strokeWidth, stroke:stroke}).transform(matrix);
            }
            else if (strObj == "rect") {
                var x = parseFloat(obj.attr("x"));
                var y = parseFloat(obj.attr("y"));
                var width = parseFloat(obj.attr("width"));
                var height = parseFloat(obj.attr("height"));
                var rx = parseFloat(obj.attr("rx"));
                var ry = parseFloat(obj.attr("ry"));
                if (isNaN(rx) || isNaN(ry)) {
                    segs = [
                        ["M", x.toFixed(5), y.toFixed(5)],
                        ["H", (x+width).toFixed(5)],
                        ["V", (y+height).toFixed(5)],
                        ["H", x.toFixed(5)],
                        ["z"]
                    ];
                }
                else {
                    var r = x + width;
                    var b = y + height;

                    if (rx < 0.0) {
                        rx *= -1;
                    }
                    if (ry < 0.0) {
                        ry *= -1;
                    }
                    segs = [
                        ["M", (x+rx).toFixed(5), y.toFixed(5)],
                        ["L", (r-rx).toFixed(5), y.toFixed(5)],
                        ["Q", r.toFixed(5), y.toFixed(5), r.toFixed(5), (y+ry).toFixed(5)],
                        ["L", r.toFixed(5), (b-ry).toFixed(5)],
                        ["Q", r.toFixed(5), b.toFixed(5), (r-rx).toFixed(5), b.toFixed(5)],
                        ["L", (x+rx).toFixed(5), b.toFixed(5)],
                        ["Q", x.toFixed(5), b.toFixed(5), x.toFixed(5), (b-ry).toFixed(5)],
                        ["L", x.toFixed(5), (y+ry).toFixed(5)],
                        ["Q", x.toFixed(5), y.toFixed(5), (x+rx).toFixed(5), y.toFixed(5)],
                        ["z"]
                    ];
                }
                snap.path(segs).attr({fill:"none", strokeWidth:strokeWidth, stroke:stroke}).transform(matrix);
            }
            else if (strObj == "line") {
                var x1 = parseFloat(obj.attr("x1"));
                var y1 = parseFloat(obj.attr("y1"));
                var x2 = parseFloat(obj.attr("x2"));
                var y2 = parseFloat(obj.attr("y2"));
                segs = [
                    ["M", x1.toFixed(5), y1.toFixed(5)],
                    ["L", x2.toFixed(5), y2.toFixed(5)]
                ];
                snap.path(segs).attr({fill:"none", strokeWidth:strokeWidth, stroke:stroke}).transform(matrix);
            }
            else if (strObj == "circle") {
                var cx = parseFloat(obj.attr("cx"));
                var cy = parseFloat(obj.attr("cy"));
                var r = parseFloat(obj.attr("r"));
                segs = [
                    ["M", (cx-r).toFixed(5), cy.toFixed(5)],
                    ["A", r.toFixed(5), r.toFixed(5), "0", "0", "0", cx.toFixed(5),     (cy+r).toFixed(5)],
                    ["A", r.toFixed(5), r.toFixed(5), "0", "0", "0", (cx+r).toFixed(5), cy.toFixed(5)],
                    ["A", r.toFixed(5), r.toFixed(5), "0", "0", "0", cx.toFixed(5),     (cy-r).toFixed(5)],
                    ["A", r.toFixed(5), r.toFixed(5), "0", "0", "0", (cx-r).toFixed(5), cy.toFixed(5)],
                    ["z"]
                ];
                snap.path(segs).attr({fill:"none", strokeWidth:strokeWidth, stroke:stroke}).transform(matrix);
            }
            else if (strObj == "ellipse") {
                var cx = parseFloat(obj.attr("cx"));
                var cy = parseFloat(obj.attr("cy"));
                var rx = parseFloat(obj.attr("rx"));
                var ry = parseFloat(obj.attr("ry"));
                segs = [
                    ["M", (cx-rx).toFixed(5), cy.toFixed(5)],
                    ["A", rx.toFixed(5), ry.toFixed(5), "0", "0", "0", cx.toFixed(5),     (cy+ry).toFixed(5)],
                    ["A", rx.toFixed(5), ry.toFixed(5), "0", "0", "0", (cx+rx).toFixed(5), cy.toFixed(5)],
                    ["A", rx.toFixed(5), ry.toFixed(5), "0", "0", "0", cx.toFixed(5),     (cy-ry).toFixed(5)],
                    ["A", rx.toFixed(5), ry.toFixed(5), "0", "0", "0", (cx-rx).toFixed(5), cy.toFixed(5)],
                    ["z"]
                ];
                snap.path(segs).attr({fill:"none", strokeWidth:strokeWidth, stroke:stroke}).transform(matrix);
            }
            else if (strObj == "polygon") {
                d = "M" + obj.attr("points") + "z";
                snap.path(d).attr({fill:"none", strokeWidth:strokeWidth, stroke:stroke}).transform(matrix);
            }
            else if (strObj == "polyline") {
                d = "M" + obj.attr("points");
                snap.path(d).attr({fill:"none", strokeWidth:strokeWidth, stroke:stroke}).transform(matrix);
            }
        };
        // -------------------------------------------------------------

        var retSvgStr = "";
        var snapSrc = Snap().remove();
        var snapSrcColor = Snap();
        var snapDst = Snap();
        var setObj;
        var setObjColor;

        // SVG文字列を取り込む
        snapSrc.group().append(Snap.parse(svgString));
        snapSrcColor.group().append(Snap.parse(svgString));

        // defsをすべて削除
        setObj = snapSrc.selectAll("defs");
        setObjColor = snapSrcColor.selectAll("defs");
        for (var i = 0; i < setObj.length; i++) {
            setObj[i].remove();
            setObjColor[i].remove();
        }
        // patternをすべて削除
        setObj = snapSrc.selectAll("pattern");
        setObjColor = snapSrcColor.selectAll("pattern");
        for (var i = 0; i < setObj.length; i++) {
            setObj[i].remove();
            setObjColor[i].remove();
        }
        // markerをすべて削除
        setObj = snapSrc.selectAll("marker");
        setObjColor = snapSrcColor.selectAll("marker");
        for (var i = 0; i < setObj.length; i++) {
            setObj[i].remove();
            setObjColor[i].remove();
        }
        // flowRootをすべて削除
        setObj = snapSrc.selectAll("flowRoot");
        setObjColor = snapSrcColor.selectAll("flowRoot");
        for (var i = 0; i < setObj.length; i++) {
            setObj[i].remove();
            setObjColor[i].remove();
        }
        // グループのdisplayの設定がdisplayの要素を削除する
        setObj = snapSrc.selectAll("g");
        setObjColor = snapSrcColor.selectAll("g");
        for (var i = 0; i < setObj.length; i++) {
            if (setObjColor[i].attr("display") == "none") {
                setObj[i].remove();
                setObjColor[i].remove();
            }
        }


        // すべての要素を操作
        var selectArr = [ "path", "rect", "line", "circle", "ellipse", "polygon", "polyline" ];
        for (var i = 0; i < selectArr.length; i++) {
            setObj = snapSrc.selectAll(selectArr[i]);
            setObjColor = snapSrcColor.selectAll(selectArr[i]);
            for (var j = 0; j < setObj.length; j++) {

                copyObj(selectArr[i], setObj[j], setObjColor[j], snapDst, colorArray);

            }
        }

        // ページのサイズを合わせる
        var bBOX = snapDst.getBBox();
        snapDst.attr({viewBox:[bBOX.x, bBOX.y, bBOX.width, bBOX.height]});

        // 文字列に出力
        retSvgStr = snapDst.toString();
        snapSrc.remove();
        snapSrcColor.remove();
        snapDst.remove();

        return retSvgStr;
    };
    // -------------------------------------------------------------
    // SVGのDPIを取得
    var getSvgDpi = function(svgString) {
        var dpi = 90;

        var svghead = svgString.slice(0,400);
        if (svghead.search(/Inkscape/i) != -1) {
            dpi = 90;
        }
        else if (svghead.search(/Illustrator/i) != -1) {
            dpi = 72;
        }
        else if (svghead.search(/Intaglio/i) != -1) {
            dpi = 72;
        }
        else if (svghead.search(/CorelDraw/i) != -1) {
            dpi = 96;
        }
        else if (svghead.search(/Qt/i) != -1) {
            dpi = 90;
        }

        return dpi;
    };
    // -------------------------------------------------------------
    // DXFをSVGに変換
    var dxfToSvg = function(dxfString) {
        // -------------------------------------------------------------
        if (!String.prototype.format) {
            String.prototype.format = function() {

                // Improved upon http://stackoverflow.com/a/1685917/1449117
                var toFixed = function(x) {
                    if (Math.abs(x) < 1.0) {
                        var e = parseInt(x.toString().split('e-')[1]);
                        if (e) {
                            x *= Math.pow(10,e-1);
                            var pos = x.toString().indexOf('.')+1;
                            var pre = x.toString().substr(0, pos);
                            x = pre + (new Array(e+1)).join('0') + x.toString().substring(pos);
                        }
                    } else {
                        var e = parseInt(x.toString().split('+')[1]);
                        if (e > 20) {
                            e -= 20;
                            x /= Math.pow(10,e);
                            x += (new Array(e+1)).join('0');
                        }
                    }
                    return x;
                };

                // Borrowed from http://stackoverflow.com/a/4673436/1449117
                var args = arguments;
                return this.replace(/{(\d+)}/g, function(match, number) {
                    if (args[number] != 'undefined') {
                        var arg = args[number];

                        // Borrowed from http://stackoverflow.com/a/6449623/1449117
                        var isArgANumber = !isNaN(parseFloat(arg)) && isFinite(arg);

                        if (isArgANumber) {
                            arg = toFixed(arg);
                        }
                        return arg;
                    } else {
                        return match;
                    }
                });
            };
        }
        // -------------------------------------------------------------
        var dxfObjectToSvgSnippet = function(dxfObject)
        {
            // -------------------------------------------------------------
            var getLineSvg = function(x1, y1, x2, y2)
            {
                return '<path d="M{0},{1} {2},{3}" {4} {5}/>\n'.format(x1, y1, x2, y2, strTransform, strStyle);
            };
            // -------------------------------------------------------------
            var deg2rad = function(deg)
            {
                return deg * (Math.PI/180);
            };
            // -------------------------------------------------------------

            switch (dxfObject.type) {
                case 'LINE':
                    return getLineSvg(dxfObject.x, dxfObject.y, dxfObject.x1, dxfObject.y1);
                case 'CIRCLE':
    //                return '<circle cx="{0}" cy="{1}" r="{2}" {3} {4}/>\n'.format(dxfObject.x, dxfObject.y, dxfObject.r, strTransform, strStyle);
                    var cx = dxfObject.x;
                    var cy = dxfObject.y;
                    var r = dxfObject.r;
                    return '<path d="M{0},{1} A{2},{3},0,0,0,{4},{5} A{6},{7},0,0,0,{8},{9} A{10},{11},0,0,0,{12},{13} A{14},{15},0,0,0,{16},{17} Z" {18} {19}/>\n'.format((cx-r), cy, r, r, cx, (cy+r), r, r, (cx+r), cy, r, r, cx, (cy-r), r, r, (cx-r), cy, strTransform, strStyle);
                case 'ARC':
                    var x1 = dxfObject.x + dxfObject.r * Math.cos(deg2rad(dxfObject.a0));
                    var y1 = dxfObject.y + dxfObject.r * Math.sin(deg2rad(dxfObject.a0));
                    var x2 = dxfObject.x + dxfObject.r * Math.cos(deg2rad(dxfObject.a1));
                    var y2 = dxfObject.y + dxfObject.r * Math.sin(deg2rad(dxfObject.a1));

                    if (dxfObject.a1 < dxfObject.a0) {
                        dxfObject.a1 += 360;
                    }
                    var largeArcFlag = dxfObject.a1 - dxfObject.a0 > 180 ? 1 : 0;

                    return '<path d="M{0},{1} A{2},{3} 0 {4},1 {5},{6}" {7} {8}/>\n'.
                            format(x1, y1, dxfObject.r, dxfObject.r, largeArcFlag, x2, y2, strTransform, strStyle);
                case 'LWPOLYLINE':
                    var svgSnippet = '';
                    var vertices = dxfObject.vertices;
                    for (var i=0; i<vertices.length-1; i++) {
                        var vertice1 = vertices[i];
                        var vertice2 = vertices[i+1];
                        svgSnippet += getLineSvg(vertice1.x, vertice1.y, vertice2.x, vertice2.y);
                    }
                    return svgSnippet;
            }
        };
        // -------------------------------------------------------------

        var groupCodes = {
            0: 'entityType',
            2: 'blockName',
            10: 'x',
            11: 'x1',
            20: 'y',
            21: 'y1',
            40: 'r',
            50: 'a0',
            51: 'a1'
        };

        var supportedEntities = [
            'LINE',
            'CIRCLE',
            'ARC',
            'LWPOLYLINE'
        ];

        var counter = 0;
        var code = null;
        var isEntitiesSectionActive = false;
        var object = {};
        var svg = '';

        var strokeWidth = 0.2;
        var pixelToMillimeterConversionRatio = 3.543299873306695;
        var strTransform = 'transform="scale({0},-{0})"'.format(pixelToMillimeterConversionRatio)
        var strStyle = 'style="stroke:black; stroke-width:' + strokeWidth + '; ' + 'fill:none"';

        // Normalize platform-specific newlines.
        dxfString = dxfString.replace(/\r\n/g, '\n');
        dxfString = dxfString.replace(/\r/g, '\n');

        dxfString.split('\n').forEach(function(line) {
            line = line.trim();

            if (counter++ % 2 === 0) {
                code = parseInt(line);
            } else {
                var value = line;
                var groupCode = groupCodes[code];
                if (groupCode === 'blockName' && value === 'ENTITIES') {
                    isEntitiesSectionActive = true;
                } else if (isEntitiesSectionActive) {
                    if (groupCode === 'entityType') {  // New entity starts.
                        if (object.type) {
                            svg += dxfObjectToSvgSnippet(object);
                        }

                        object = $.inArray(value, supportedEntities) > -1 ? {type: value} : {};

                        if (value === 'ENDSEC') {
                            isEntitiesSectionActive = false;
                        }
                    } else if (object.type && typeof groupCode !== 'undefined') {  // Known entity property recognized.
                        object[groupCode] = parseFloat(value);

                        if (object.type == 'LWPOLYLINE' && groupCode === 'y') {
                            if (!object.vertices) {
                                object.vertices = [];
                            }
                            object.vertices.push({x:object.x, y:object.y});
                        }
                    }
                }
            }
        });

        if (svg === '') {
            return "";
        }

        var svgId = "svg" + Math.round(Math.random() * Math.pow(10, 17));
        svg = '<svg {0} version="1.1" xmlns="http://www.w3.org/2000/svg">\n' +
              svg +
              '</svg>\n';

        // The SVG has to be added to the DOM to be able to retrieve its bounding box.
        $(svg.format('id="'+svgId+'"')).appendTo('body');
        var boundingBox = $('svg')[0].getBBox();
        var viewBoxValue = '{0} {1} {2} {3}'.format(boundingBox.x-strokeWidth/2, boundingBox.y-strokeWidth/2,
                                                    boundingBox.width+strokeWidth, boundingBox.height+strokeWidth);
        $('#'+svgId).remove();

        return svg.format('viewBox="' + viewBoxValue + '"');
    };
    // -------------------------------------------------------------
    // 画像をSVGに変換
    var imgToSvg = function(img) {
        // -------------------------------------------------------------
        // 画像変換関数
        var imageProcess = function(img) {
            // -------------------------------------------------------------
            //グレースケール変換関数
            var grayFilter = function(src, dst, width, height) {
                for (var i = 0; i < height; i++) {
                    for (var j = 0; j < width; j++) {
                        var idx = (j + i * width) * 4;
                        var gray = (src[idx] + src[idx + 1] + src[idx + 2]) / 3;
                        dst[idx] = gray;
                        dst[idx + 1] = gray;
                        dst[idx + 2] = gray;
                        dst[idx + 3] = src[idx + 3];
                    }
                }
            };
            // -------------------------------------------------------------
            //フロイド-スタインバーグ変換関数
            var floydFilter = function(img, width, height) {
                var idx, newPixel, err;

                for (var i = 0; i < height; i++) {
                    for (var j = 0; j < width; j++) {
                        idx = (j + i * width) * 4;
                        newPixel = img[idx] < 128 ? 0 : 255;
                        err = img[idx]  - newPixel;
                        img[idx] = newPixel;

                        img[idx + 4             ] += err * 7 / 16;
                        img[idx + 4 * width - 4 ] += err * 3 / 16;
                        img[idx + 4 * width     ] += err * 5 / 16;
                        img[idx + 4 * width + 4 ] += err * 1 / 16;
                        img[idx + 1] = img[idx + 2] = img[idx];

                    }
                }
            };
            // -------------------------------------------------------------

            var canvas = document.createElement("canvas");
            //キャンバスに画像をセット
            var context = canvas.getContext('2d');

            var RASTER_WIDTH_MAX = 1024;
            if (img.width >= RASTER_WIDTH_MAX) {
                // 画像のサイズ変更
                var scale = (RASTER_WIDTH_MAX - 1) / img.width;
                var dstWidth = img.width * scale;
                var dstHeight = img.height * scale

                canvas.width = dstWidth;
                canvas.height = dstHeight;
                context.drawImage(img, 0, 0, img.width, img.height, 0, 0, dstWidth, dstHeight);

            }
            else {
                canvas.width = img.width;
                canvas.height = img.height;
                context.drawImage(img, 0, 0);
            }

            //フィルター処理
            var width = canvas.width;
            var height = canvas.height;

            var srcData = context.getImageData(0, 0, width, height);
            var dstData = context.createImageData(width, height);
            var src = srcData.data;
            var dst = dstData.data;
            grayFilter(src, dst, width, height);
            floydFilter(dst, width, height);
            context.putImageData(dstData, 0, 0);

            return {
                dataUrl: canvas.toDataURL(),
                width: width,
                height: height
                };
        };
        // -------------------------------------------------------------
        // データURLをSVG文字列に変換
        var dataURLtoSVGString = function(dataurl, width, height) {
            var snap;
            var svgstring;

            snap = Snap(width, height);
            snap.image(dataurl, 0, 0, width, height);
            svgstring = snap.toString();
            snap.remove();

            return svgstring;
        };
        // -------------------------------------------------------------

        var retSvgStr = "";

        // 画像処理
        var imgData = imageProcess(img);
        // SVGに変換
        retSvgStr = dataURLtoSVGString(imgData.dataUrl, imgData.width, imgData.height);

        return retSvgStr;
    };
    // -------------------------------------------------------------
}
