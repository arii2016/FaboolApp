
// module to handle design data
// converts between boundry representation and gcode
// creates previews

DataHandler = {
    data_num : 0,
    paths_by_color : [],
    rasters_by_color : [],
    data_passes : [],
    stats_by_color : [],


    clear : function() {
        this.data_num = 0;
        this.paths_by_color = [];
        this.rasters_by_color = [];
        this.data_passes = [];
        this.stats_by_color = [];
    },

    addData : function() {
        this.data_num++;
        this.paths_by_color.push({});
        this.rasters_by_color.push({});
        this.data_passes.push([]);
        this.stats_by_color.push({});
    },

    isEmpty : function() {
        var ret = 1;

        for (var i = 0; i < this.data_num; i++) {
            if (Object.keys(this.paths_by_color[i]).length != 0) {
                ret = 0;
                break;
            }
            if (Object.keys(this.rasters_by_color[i]).length != 0) {
                ret = 0;
                break;
            }
        }
        return ret;
    },

    setData : function(dataArr) {
        this.clear();

        for (var i = 0; i < dataArr.length; i++) {
            this.addData();
            this.setByPaths(i, dataArr[i].boundarys);
            this.segmentizeLongLines(i);
            this.addRasters(i, dataArr[i].rasters);
            this.calculateBasicStats(i);
        }
    },

    setByPaths : function(idx, boundarysArr) {
        for (var color in boundarysArr) {
            var paths_src = boundarysArr[color];

            if (!this.rasters_by_color[idx][color]) {
                this.rasters_by_color[idx][color] = [];
            }
            if (!this.paths_by_color[idx][color]) {
                this.paths_by_color[idx][color] = [];
            }
            var paths = this.paths_by_color[idx][color];
            for (var i=0; i<paths_src.length; i++) {
                var path = [];
                paths.push(path);
                var path_src = paths_src[i];
                for (var p=0; p<path_src.length; p++) {
                    path.push([path_src[p][0], path_src[p][1]]);
                }
            }
        }
    },

    addRasters : function(idx, rastersArr) {
        for (var color in rastersArr) {
            var rasters_src = rastersArr[color];
            if (color == 0) {
                color = '#0000ff'
            }
            if (!this.rasters_by_color[idx][color]) {
                this.rasters_by_color[idx][color] = [];
            }
            if (!this.paths_by_color[idx][color]) {
                this.paths_by_color[idx][color] = [];
            }
            var rasters = this.rasters_by_color[idx][color];
            rasters.push(rasters_src);
        }
    },

    jobProcess : function() {
        // 画像の変換が必要か確認
        var LoadImgNum = 0;
        for (var i = 0; i < this.data_num; i++) {
            for (var color in this.rasters_by_color[i]) {
                var rasters = this.rasters_by_color[i][color];
                if (!rasters) {
                    continue;
                }
                for (var j = 0; j < rasters.length; j++) {
                    var raster = rasters[j];
                    if (raster.length < 5) {
                        LoadImgNum++;
                    }
                }
            }
        }
    
        if (LoadImgNum == 0) {
            // 画像変換が必要ない場合は、そのまま実行
            send_gcode(this.getGcode(), "G-Code sent to backend.", true);
            return;
        }

        // 画像変換後に実行
        var loadCnt = 0;
        for (var i = 0; i < this.data_num; i++) {
            for (var color in this.rasters_by_color[i]) {
                var rasters = this.rasters_by_color[i][color];
                if (!rasters) {
                    continue;
                }
                for (var j = 0; j < rasters.length; j++) {
                    var raster = rasters[j];
                    if (raster.length == 5) {
                        continue;
                    }
                    var image = new Image();
                    image.onload = finish(this.rasters_by_color, image, i, color, j);
                    image.src = raster[2];
                    function finish(ras_by_color, img, i, color, j){
                        return function(){
                            // 画像を追加
                            var canvas = document.createElement("canvas");
                            var context = canvas.getContext('2d');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            context.drawImage(img, 0, 0);

                            var width = canvas.width;
                            var height = canvas.height;
                            var imageData = new Array(width * height);
                            var srcData = context.getImageData(0, 0, width, height);
                            var src = srcData.data;
                            for (var k= 0; k < height; k++) {
                                for (var l = 0; l < width;l++) {
                                    imageData[l + k * width] = src[(l + k * width) * 4];
                                }
                            }
                            ras_by_color[i][color][j].push(imageData);


                            loadCnt++;
                            if (LoadImgNum == loadCnt) {
                                // すべての画像を変換したら次の処理へ
                                send_gcode(DataHandler.getGcode(), "G-Code sent to backend.", true);
                            }
                        }
                    }
                }
            }
        }


    },

  // writers //////////////////////////////////
    getGcode : function() {
        var glist = [];
        glist.push("~\nG30\n");             // 原点復帰
        glist.push("G90\nM80\n");
        glist.push("G0F"+app_settings.max_seek_speed+"\n");

        for (var i=0; i<this.data_num; i++) {
            var passes = this.data_passes[i];

            // passes
            for (var j = 0; j < passes.length; j++) {
                var pass = passes[j];
                var colors = pass['colors'];
                var feedrate = this.mapConstrainFeedrate(pass['feedrate']);
                var intensity = this.mapConstrainIntesity(pass['intensity']);
                glist.push("G1F"+feedrate+"\nS"+intensity+"\n");

                for (var color in colors) {
                    // Rasters
                    var rasters = this.rasters_by_color[i][color];
                    for (var k=0; k<rasters.length; k++) {
                        var raster = rasters[k];

                        // Raster Data
                        var x1 = raster[0][0];
                        var y1 = raster[0][1];
                        var width = raster[1][0];
                        var height = raster[1][1];
                        var pixwidth = raster[3][0];
                        var pixheight = raster[3][1];
                        var data = raster[4];

                        // Raster Variables
                        var dot_pitch = width / pixwidth;

                        // Calculate the offset based on acceleration and feedrate.
                        var offset = 0.5 * feedrate * feedrate / 8000000;
                        offset *= 1.1;  // Add some margin.
                        if (offset < 5) {
                            offset = 5;
                        }

                        // Setup the raster header
                        glist.push("G00X"+x1.toFixed(app_settings.num_digits)+"Y"+y1.toFixed(app_settings.num_digits)+"\n");
                        glist.push("G08P"+dot_pitch.toFixed(app_settings.num_digits+2)+"\n");
                        glist.push("G08X"+offset.toFixed(app_settings.num_digits)+"Z0\n");
                        glist.push("G08N0\n");

                        // Calculate pixels per pulse
                        var pppX = pixwidth / (width / dot_pitch);
                        var pppY = pixheight / (height / dot_pitch);
                        var reverse = 0;

                        var LineCnt = 0;
                        // Now for the raster data
                        for (var y = 0; y < pixheight; y += pppY) {
                            var line = Math.round(y) * pixwidth;
                            var count = 0;
                            var empty = 1;
                            var raster = "";
                            raster += "G8 D";

                            if (reverse == 0) {
                                for (var x = 0; x < pixwidth; x += pppX) {
                                    var pixel = line + Math.round(x);
                                    if (data[pixel] == 0) {
                                        raster += "1";
                                        empty = 0;
                                    } else {
                                        raster += "0";
                                    }
                                    count++;
                                    if (count % 70 == 0) {
                                        raster += "\nG8 D";
                                    }
                                }
                            }
                            else {
                                for (var x = pixwidth - 1; x >= 0; x -= pppX) {
                                    var pixel = line + Math.round(x);
                                    if (data[pixel] == 0) {
                                        raster += "1";
                                        empty = 0;
                                    } else {
                                        raster += "0";
                                    }
                                    count++;
                                    if (count % 70 == 0) {
                                        raster += "\nG8 D";
                                    }
                                }
                            }
                            if (empty == 0) {
                                if (reverse == 0) {
                                    glist.push("G8 R0\n");
                                    reverse = 1;
                                } else {
                                    glist.push("G8 R1\n");
                                    reverse = 0;
                                }
                                glist.push(raster + "\n");
                                glist.push("G8 N0\n");
                            }
                            else {
                                glist.push("G00X"+(x1).toFixed(app_settings.num_digits)+"Y"+(y1 + (dot_pitch * LineCnt)).toFixed(app_settings.num_digits)+"\n");
                                reverse = 0;
                            }
                            LineCnt++;
                        }
                    }
                    // Paths
                    var paths = this.paths_by_color[i][color];
                    for (var k=0; k<paths.length; k++) {
                        var path = paths[k];
                        if (path.length > 0) {
                            var vertex = 0;
                            var x = path[vertex][0];
                            var y = path[vertex][1];
                            glist.push("G0X"+x.toFixed(app_settings.num_digits)+
                            "Y"+y.toFixed(app_settings.num_digits)+"\n");
                            for (vertex=1; vertex<path.length; vertex++) {
                                var x = path[vertex][0];
                                var y = path[vertex][1];
                                glist.push("G1X"+x.toFixed(app_settings.num_digits)+
                                "Y"+y.toFixed(app_settings.num_digits)+"\n");
                            }
                        }
                    }
                }
            }
        }
        // footer
        glist.push("M81\nS0\nG0X0Y0F"+app_settings.max_seek_speed+"\n");
        return glist.join('');
    },

  getBboxGcode : function() {
    var bbox = this.getJobBbox();
    var glist = [];
    glist.push("G90\n");
    glist.push("G0F"+app_settings.max_seek_speed+"\n");
    glist.push("G00X"+bbox[0].toFixed(3)+"Y"+bbox[1].toFixed(3)+"\n");
    glist.push("G00X"+bbox[2].toFixed(3)+"Y"+bbox[1].toFixed(3)+"\n");
    glist.push("G00X"+bbox[2].toFixed(3)+"Y"+bbox[3].toFixed(3)+"\n");
    glist.push("G00X"+bbox[0].toFixed(3)+"Y"+bbox[3].toFixed(3)+"\n");
    glist.push("G00X"+bbox[0].toFixed(3)+"Y"+bbox[1].toFixed(3)+"\n");
    glist.push("G0X0Y0F"+app_settings.max_seek_speed+"\n");
    return glist.join('');
  },

  // passes and colors //////////////////////////

  addPass : function(idx, mapping) {
    // this describes in what order colors are written
    // and also what intensity and feedrate is used
    // mapping: {'colors':colors, 'feedrate':feedrate, 'intensity':intensity}
    this.data_passes[idx].push(mapping);
  },

  clearPasses : function(idx) {
    this.data_passes[idx] = [];
  },

    getPassesColors : function(idx) {
        var all_colors = {};
        for (var i=0; i<this.data_passes[idx].length; i++) {
            var mapping = this.data_passes[idx][i];
            var colors = mapping['colors'];
            for (var color in colors) {
                all_colors[color] = true;
            }
        }
        return all_colors;
    },

    getColorOrder : function(idx) {
        var color_order = {};

        var color_count = 0;
        for (var color in this.rasters_by_color[idx]) {
            color_order[color] = color_count;
            color_count++;
        }
        for (var color in this.paths_by_color[idx]) {    
            color_order[color] = color_count;
            color_count++;
        }

        return color_order
    },


  // stats //////////////////////////////////////

  calculateBasicStats : function(idx) {
    var x_prev = 0;
    var y_prev = 0;
    var path_length_all = 0;
    var bbox_all = [Infinity, Infinity, 0, 0];
    var stats_by_color = {};

    for (var color in this.paths_by_color[idx]) {
      var path_lenths_color = 0;
      var bbox_color = [Infinity, Infinity, 0, 0];
      var paths = this.paths_by_color[idx][color];
      for (var k=0; k<paths.length; k++) {
        var path = paths[k];
        if (path.length > 1) {
          var x = path[0][0];
          var y = path[0][1];
          this.bboxExpand(bbox_color, x, y);
          x_prev = x;
          y_prev = y;
          for (var vertex=1; vertex<path.length; vertex++) {
            var x = path[vertex][0];
            var y = path[vertex][1];
            path_lenths_color += 
              Math.sqrt((x-x_prev)*(x-x_prev)+(y-y_prev)*(y-y_prev));
            this.bboxExpand(bbox_color, x, y);
            x_prev = x;
            y_prev = y;
          }
        }
      }
      if (paths.length) {
        stats_by_color[color] = {
          'bbox':bbox_color,
          'length':path_lenths_color
        }
        // add to total also
        path_length_all += path_lenths_color;
        this.bboxExpand(bbox_all, bbox_color[0], bbox_color[1]);
        this.bboxExpand(bbox_all, bbox_color[2], bbox_color[3]);
      }
    }

    // rasters
    for (var color in this.rasters_by_color[idx]) {
      var raster_lengths_color = 1;
      var bbox_color = [Infinity, Infinity, 0, 0];
      var rasters = this.rasters_by_color[idx][color];
      if (rasters) {
        for (var k=0; k<rasters.length; k++) {
          var raster = rasters[k];
          var x = raster[0][0];
          var y = raster[0][1];
          var width = raster[1][0];
          var height = raster[1][1];
          this.bboxExpand(bbox_color, x, y);
          this.bboxExpand(bbox_color, x + width, y + height);
        }
      }
      if (rasters.length) {
        stats_by_color[color] = {
          'bbox':bbox_color,
          'length':raster_lengths_color
        }
        // add to total also
        path_length_all += raster_lengths_color;
        this.bboxExpand(bbox_all, bbox_color[0], bbox_color[1]);
        this.bboxExpand(bbox_all, bbox_color[2], bbox_color[3]);
      }
    }
    this.stats_by_color[idx] = stats_by_color;
  },


  bboxExpand : function(bbox, x, y) {
    if (x < bbox[0]) {bbox[0] = x;}
    else if (x > bbox[2]) {bbox[2] = x;}
    if (y < bbox[1]) {bbox[1] = y;}
    else if (y > bbox[3]) {bbox[3] = y;}
  },

  getJobPathLength : function() {
    var total_length = 0;
    for (var i = 0; i < this.data_num; i++) {
        for (var color in this.getPassesColors(i)) {
          stat = this.stats_by_color[i][color];
          total_length += stat['length'];
        }
    }

    return total_length;
  },

  getJobBbox : function() {
    var total_bbox = [Infinity, Infinity, 0, 0];

    for (var i = 0; i < this.data_num; i++) {
        for (var color in this.getPassesColors(i)) {
            stat = this.stats_by_color[i][color];
            this.bboxExpand(total_bbox, stat['bbox'][0], stat['bbox'][1]);
            this.bboxExpand(total_bbox, stat['bbox'][2], stat['bbox'][3]);
        }
    }

    return total_bbox;
  },


  // path optimizations /////////////////////////

  segmentizeLongLines : function(idx) {
    var x_prev = 0;
    var y_prev = 0;
    var d2 = 0;
    var length_limit = app_settings.max_segment_length;
    var length_limit2 = length_limit*length_limit;

    var lerp = function(x0, y0, x1, y1, t) {
      return [x0*(1-t)+x1*t, y0*(1-t)+y1*t];
    }

    for (var color in this.paths_by_color[idx]) {
      var paths = this.paths_by_color[idx][color];
      for (var k=0; k<paths.length; k++) {
        var path = paths[k];
        if (path.length > 1) {
          var new_path = [];
          var copy_from = 0;
          var x = path[0][0];
          var y = path[0][1];
          // ignore seek lines for now
          x_prev = x;
          y_prev = y;
          for (var vertex=1; vertex<path.length; vertex++) {
            var x = path[vertex][0];
            var y = path[vertex][1];
            d2 = (x-x_prev)*(x-x_prev) + (y-y_prev)*(y-y_prev);
            // check length for each feed line
            if (d2 > length_limit2) {
              // copy previous verts
              for (var n=copy_from; n<vertex; n++) {
                new_path.push(path[n]);
              }
              // add lerp verts
              var t_step = 1/(Math.sqrt(d2)/length_limit);
              for(var t=t_step; t<0.99; t+=t_step) {
                new_path.push(lerp(x_prev, y_prev, x, y, t));
              }
              copy_from = vertex;
            }
            x_prev = x;
            y_prev = y;
          }
          if (new_path.length > 0) {
            // add any rest verts from path
            for (var p=copy_from; p<path.length; p++) {
              new_path.push(path[p]);
            }
            copy_from = 0;
            paths[k] = new_path;
          }
        }
      }
    }
  },


  // auxilliary /////////////////////////////////

  mapConstrainFeedrate : function(rate) {
    rate = parseInt(rate);
    if (rate < .1) {
      rate = .1;
      $().uxmessage('warning', "速度は0.1以上に設定してください。");
    } else if (rate > 8000) {
      rate = 8000;
      $().uxmessage('warning', "速度は8000以下に設定してください。");
    }
    return rate.toString();
  },
    
  mapConstrainIntesity : function(intens) {
    intens = parseInt(intens);
    if (intens < 0) {
      intens = 0;
      $().uxmessage('warning', "出力パワーは0%以上に設定してください。");
    } else if (intens > 100) {
      intens = 100;
      $().uxmessage('warning', "出力パワーは100%以下に設定してください。");
    }
    //map to 255 for now until we change the backend
    return Math.round(intens * 2.55).toString();
  },

}