"use strict";

var FILE_TYPE = {
    SVG: 0,
    DXF: 1,
    IMG: 2,
    _SIZEOF : 3,
};

// -------------------------------------------------------------
function warkCanvas(strCanvas, warkAreaWidth, warkAreaHeight, canvasWidth)
{
    var _canvasWidth = canvasWidth;
    var _warkAreaWidth = warkAreaWidth;
    var _warkAreaHeight = warkAreaHeight;
    var originCanvasScale = _canvasWidth / _warkAreaWidth;
    var canvasScale = originCanvasScale;

    var fabCanvas = new fabric.Canvas(strCanvas, {
        width: _warkAreaWidth * canvasScale, 
        height: _warkAreaHeight * canvasScale,
        imageSmoothingEnabled : false,      // 画像を平滑化しない
    });

    // ピクセルをmmに変換
    var PX_TO_MM = function(dpi) {
        return 25.4 / dpi;
    };
    var OUT_PUT_DPI = 90;   // SYG出力DPI
    // SVG出力用
    var fabDummyCanvas = new fabric.Canvas("", {
        width: _warkAreaWidth / PX_TO_MM(OUT_PUT_DPI), 
        height: _warkAreaHeight / PX_TO_MM(OUT_PUT_DPI), 
        imageSmoothingEnabled : false,      // 画像を平滑化しない
    });

    // コピー・ペースト
    var copyObjs = [];      // コピーするオブジェクト
    var COPY_PASTE_OFFSET = 5;

    // undo・redo
    var stateArr = [fabCanvas.toJSON()];      // 変更ステータス保存配列
    var evnDiseble = false;
    var STATE_BUFFER_NUM = 4;

    // zoomIn・ZoomOut
    var SCALE_FACTOR = 1.5;
    var MAX_SCALE = 5;

    // -------------------------------------------------------------
    // オブジェクトを追加
    this.addObj = function(svgString, fileType, dpi, colorArr) {

        fabric.loadSVGFromString(svgString, function(objects, options) {
            var obj = fabric.util.groupSVGElements(objects, options);

            // ファイルの種類を保存
            obj.fileType = fileType;

            // DPIを保存
            obj.dpi = dpi;

            // 色情報を保存
            obj.colorArr = colorArr;

            // 元の位置・スケールを保存
            obj.originTop = obj.top;
            obj.originLeft = obj.left;
            obj.originScaleX = obj.scaleX;
            obj.originScaleY = obj.scaleY;

            // JSON出力の追加項目を設定する
            obj.toObject = (function(toObject) {
                return function() {
                    return fabric.util.object.extend(toObject.call(this), {
                        hasRotatingPoint: this.hasRotatingPoint,
                        lockRotation: this.lockRotation,
                        lockScalingFlip: this.lockScalingFlip,
                        lockUniScaling: this.lockUniScaling,
                        fileType: this.fileType,
                        dpi: this.dpi,
                        colorArr: this.colorArr,
                        originTop: this.originTop,
                        originLeft: this.originLeft,
                        originScaleX: this.originScaleX,
                        originScaleY: this.originScaleY,
                    });
                };
            })(obj.toObject);

            // 画像は変形を制限する
            if (fileType == FILE_TYPE.IMG) {
                // 画像の場合は、回転できないようにする
                obj.hasRotatingPoint = false;
                obj.lockRotation = true;
                // 反転できないようにする
                obj.lockScalingFlip = true;
                // 比率をかけて拡大・縮小できないようにする
                obj.lockUniScaling = true;
            }
            // リサイズ
            resizeObj(obj);
            // 追加
            fabCanvas.add(obj).renderAll();
        });
    };
    // -------------------------------------------------------------
    this.undo = function() {
        if (1 < stateArr.length) {
            evnDiseble = true;
            fabCanvas.clear().renderAll();
            fabCanvas.loadFromJSON(stateArr[stateArr.length - 2], function() {
                var objects = fabCanvas.getObjects();
                for (var i in objects) {
                    resizeObj(objects[i]);
                }
                fabCanvas.renderAll();
                evnDiseble = false;
            });
            stateArr.pop();
        }
    };
    // -------------------------------------------------------------
    // 変更ステータス更新
    var updateState = function() {
        if (evnDiseble) {
            return;
        }
        if (stateArr.length >= STATE_BUFFER_NUM) {
            stateArr.shift();
        }
        stateArr.push(fabCanvas.toJSON());
    };
    // -------------------------------------------------------------
    // オブジェクト追加イベント
    fabCanvas.on('object:added', function(options) {
        updateState();
    });
    // -------------------------------------------------------------
    // オブジェクト移動後イベント
    fabCanvas.on('object:modified', function(options) {
        // 一つだけ選択されていた場合に取得可能(null)
        var obj = fabCanvas.getActiveObject();
        // 複数選択されていた場合に取得可能(null)
        var group = fabCanvas.getActiveGroup();

        if (obj != null) {
            obj.originTop = obj.top / PX_TO_MM(obj.dpi) / canvasScale;
            obj.originLeft = obj.left / PX_TO_MM(obj.dpi) / canvasScale;
            obj.originScaleX = obj.scaleX / PX_TO_MM(obj.dpi) / canvasScale;
            obj.originScaleY = obj.scaleY / PX_TO_MM(obj.dpi) / canvasScale;

        }
        if (group != null) {
            var groupObj = group.getObjects();
            var groupTop = (group.top + (group.height / 2));
            var groupLeft = (group.left + (group.width / 2));
            for (var i = 0; i < groupObj.length; i++) {
                groupObj[i].originTop = (groupTop + groupObj[i].top) / PX_TO_MM(groupObj[i].dpi) / canvasScale;
                groupObj[i].originLeft = (groupLeft + groupObj[i].left) / PX_TO_MM(groupObj[i].dpi) / canvasScale;
                groupObj[i].originScaleX = groupObj[i].scaleX / PX_TO_MM(groupObj[i].dpi) / canvasScale;
                groupObj[i].originScaleY = groupObj[i].scaleY / PX_TO_MM(groupObj[i].dpi) / canvasScale;
            }
        }

        updateState();
    });
    // -------------------------------------------------------------
    // オブジェクト削除イベント
    fabCanvas.on('object:removed', function(options) {
        updateState();
    });
    // -------------------------------------------------------------
    // コピー
    this.copyObj = function() {
        // 一つだけ選択されていた場合に取得可能(null)
        var obj = fabCanvas.getActiveObject();
        // 複数選択されていた場合に取得可能(null)
        var group = fabCanvas.getActiveGroup();

        copyObjs = [];

        if (obj != null) {
            var cloneObj = fabric.util.object.clone(obj);
            copyObjs.push(cloneObj);

        }
        if (group != null) {
            var groupObj = group.getObjects();
            var groupTop = (group.top + (group.height / 2));
            var groupLeft = (group.left + (group.width / 2));
            for (var i = 0; i < groupObj.length; i++) {
                var cloneObj = fabric.util.object.clone(groupObj[i]);
                cloneObj.originTop = (groupTop + cloneObj.top) / PX_TO_MM(cloneObj.dpi) / canvasScale;
                cloneObj.originLeft = (groupLeft + cloneObj.left) / PX_TO_MM(cloneObj.dpi) / canvasScale;
                copyObjs.push(cloneObj);
            }
        }
    };
    // -------------------------------------------------------------
    // 貼り付け
    this.pasteObj = function() {
        for (var i = 0; i < copyObjs.length; i++) {
            copyObjs[i].originTop = (copyObjs[i].originTop + COPY_PASTE_OFFSET);
            copyObjs[i].originLeft = (copyObjs[i].originLeft + COPY_PASTE_OFFSET);
            // リサイズ
            resizeObj(copyObjs[i]);
            var cloneObj = fabric.util.object.clone(copyObjs[i]);
            fabCanvas.add(cloneObj);
        }

        fabCanvas.discardActiveObject();
        fabCanvas.discardActiveGroup();
        fabCanvas.renderAll();
    };
    // -------------------------------------------------------------
    // 選択されているオブジェクトを削除
    this.deleteOneObj = function() {
        // 一つだけ選択されていた場合に取得可能(null)
        var obj = fabCanvas.getActiveObject();
        // 複数選択されていた場合に取得可能(null)
        var group = fabCanvas.getActiveGroup();

        if (obj != null) {
            obj.remove();
        }
        if (group != null) {
            group.forEachObject(function(a) {
                fabCanvas.remove(a);
            });
            fabCanvas.discardActiveGroup();
            fabCanvas.renderAll();
        }
    };
    // -------------------------------------------------------------
    // すべてのオブジェクトを削除
    this.deleteAllObj = function() {
        fabCanvas.clear().renderAll();
    };
    // -------------------------------------------------------------
    // canvasの内容をSVG文字列に出力
    this.getSvg = function() {
        var svgStringArr = [];

        var objects = fabCanvas.getObjects();
        for (var i in objects) {
            var cloneObj = fabric.util.object.clone(objects[i]);
            var dpiCoeff = OUT_PUT_DPI / cloneObj.dpi;

            cloneObj.scaleX = cloneObj.originScaleX * dpiCoeff;
            cloneObj.scaleY = cloneObj.originScaleY * dpiCoeff;
            cloneObj.top = cloneObj.originTop * dpiCoeff;
            cloneObj.left = cloneObj.originLeft * dpiCoeff;
            cloneObj.setCoords();

            fabDummyCanvas.clear();
            fabDummyCanvas.add(cloneObj);
            svgStringArr.push(fabDummyCanvas.toSVG());
        }

        return svgStringArr;
    };
    // -------------------------------------------------------------
    // 出力SVGのDPI取得
    this.getSvgDPI = function() {
        return OUT_PUT_DPI;
    };
    // -------------------------------------------------------------
    // オブジェクトのサイズを変更する
    var resizeObj = function(obj) {
        obj.scaleX = obj.originScaleX * PX_TO_MM(obj.dpi) * canvasScale;
        obj.scaleY = obj.originScaleY * PX_TO_MM(obj.dpi) * canvasScale;
        obj.top = obj.originTop * PX_TO_MM(obj.dpi) * canvasScale;
        obj.left = obj.originLeft * PX_TO_MM(obj.dpi) * canvasScale;
        obj.setCoords();
    };
    // -------------------------------------------------------------
    // canvasのサイズを変更する
    var resizeCanvas = function() {
        fabCanvas.discardActiveObject();
        fabCanvas.discardActiveGroup();

        fabCanvas.setWidth(_warkAreaWidth * canvasScale);
        fabCanvas.setHeight(_warkAreaHeight * canvasScale);

        // すべてのオブジェクトのサイズを変更する
        var objects = fabCanvas.getObjects();
        for (var i in objects) {
            resizeObj(objects[i]);
        }

        fabCanvas.renderAll();
    };
    // -------------------------------------------------------------
    // canvas拡大
    this.zoomIn = function() {
        if (canvasScale * SCALE_FACTOR >  MAX_SCALE) {
            return;
        }

        canvasScale = canvasScale * SCALE_FACTOR;

        resizeCanvas();
    };
    // -------------------------------------------------------------
    // canvas縮小
    this.zoomOut = function() {
        if (canvasScale / SCALE_FACTOR < originCanvasScale) {
            return;
        }
        canvasScale = canvasScale / SCALE_FACTOR;

        resizeCanvas();
    };
    // -------------------------------------------------------------
    // リセット
    this.resetZoom = function() {
        canvasScale = originCanvasScale;

        resizeCanvas();
    };
    // -------------------------------------------------------------
    // 設定を保存
    this.save = function() {
        return JSON.stringify({"warkAreaWidth":_warkAreaWidth, "warkAreaHeight": _warkAreaHeight, "fabCanvas":fabCanvas });
    };
    // -------------------------------------------------------------
    // 設定を読み込み
    this.load = function(jsonString) {
        var jsonObj = JSON.parse(jsonString);
        fabCanvas.clear().renderAll();

        _warkAreaWidth = jsonObj.warkAreaWidth;
        _warkAreaHeight = jsonObj.warkAreaHeight;
        originCanvasScale = _canvasWidth / _warkAreaWidth;
        canvasScale = originCanvasScale;

        fabCanvas.loadFromJSON(jsonObj.fabCanvas, function() {
            resizeCanvas();
        });
    };
    // -------------------------------------------------------------

}
// -------------------------------------------------------------
