


///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////



$(document).ready(function(){
  
  var path_optimize = 1;
  var forceSvgDpiTo = undefined;
  
  /// big canvas init
  var w = app_settings.canvas_dimensions[0];
  var h = app_settings.canvas_dimensions[1];
  $('#import_canvas_container').html('<canvas id="import_canvas" width="'+w+'px" height="'+h+'px" style="border:1px dashed #aaaaaa;"></canvas>');
  $('#import_canvas').click(function(e){
    open_bigcanvas(4, getDeselectedColors());
    return false;
  });
  $("#import_canvas").hover(
    function () {
      $(this).css('cursor', 'url');
    },
    function () {
      $(this).css('cursor', 'pointer'); 
    }
  );
  var canvas = new Canvas('#import_canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.background('#ffffff'); 


  //reset tap
  $('#canvas_properties .colorbtns').html('');  // reset colors
  canvas.background('#ffffff');
  $('#dpi_import_info').html('読み込み可能ファイル: <b>SVG</b>, <b>DXF</b>');


  $('#bed_size_note').html(app_settings.work_area_dimensions[0]+'x'+
                           app_settings.work_area_dimensions[1]+'mm');
  
  // file upload form
  $('#svg_upload_file').change(function(e){
    $('#file_import_btn').button('loading');
    $('#svg_loading_hint').show();
    var input = $('#svg_upload_file').get(0)
    var browser_supports_file_api = true;
    if (!window.FileReader) {
      browser_supports_file_api = false;
      $().uxmessage('notice', "お使いのブラウザでは動作しません。最新バージョンをお使いください！");
    } else if (!input.files) {
      browser_supports_file_api = false;
      $().uxmessage('notice', "お使いのブラウザでは動作しません。最新バージョンをお使いください");
    }
    
    if (browser_supports_file_api) {
      if (input.files[0]) {
        var fr = new FileReader()
        fr.onload = sendToBackend
        fr.readAsText(input.files[0])
      } else {
        $().uxmessage('error', "ファイルが選択されていません。");
      }
    } else {  // fallback
      // $().uxmessage('notice', "Using fallback: file form upload.");
    }
    
    // reset file input form field so change event also triggers if
    // same file is chosen again (but with different dpi)
    $('#import_name').val($('#svg_upload_file').val().split('\\').pop().split('/').pop());
    $('#svg_upload_file').val('');

    e.preventDefault();
  });


  function sendToBackend(e) {
    var filedata = e.target.result;
    var filename = $('#import_name').val()
    var ext = filename.slice(-4);
    if (ext == '.svg' || ext == '.SVG') {
      $().uxmessage('notice', "SVG解析中");
    } else if (ext == '.dxf' || ext == '.DXF') {
      $().uxmessage('notice', "DXF解析中");
      $().uxmessage('warning', "DXFファイルはAutoCADバージョン14までの直線(LINE)、円弧(ARC)、 ライトウェイトポリライン(LWPOLYLINE)に対応してます。");
    } else if (ext == '.ngc' || ext == '.NGC') {
      $().uxmessage('notice', "Gコード解析中");
    }
    if (filedata.length > 102400) {
      $().uxmessage('notice', "大容量のファイルの場合、読み込みに数分かかることがあります。");
    }

    var geo_boundarys = SVGReader.parse(filedata, {'optimize':path_optimize, 'dpi':forceSvgDpiTo})
    handleParsedGeometry(geo_boundarys);

    $('#file_import_btn').button('reset');
    forceSvgDpiTo = undefined;  // reset

  }
      
  function handleParsedGeometry(data) {
// C:Raster Start
//    // data is a dict with the following keys [boundarys, dpi, lasertags]
    // data is a dict with the following keys [boundarys, dpi, lasertags, rasters]
// C:Raster End
    var boundarys = data;
// C:Raster Start
//    if (boundarys) {
    if (boundarys) {
// C:Raster End
      DataHandler.setByPaths(boundarys);
      if (path_optimize) {
        DataHandler.segmentizeLongLines();
      }
      // some init
      $('#canvas_properties .colorbtns').html('');  // reset colors
      canvas.background('#ffffff');

      // add preview color buttons, show info, register events
      for (var color in DataHandler.getColorOrder()) {
        $('#canvas_properties .colorbtns').append('<button class="preview_color active-strong active btn btn-small" style="margin:2px"><div style="width:10px; height:10px; background-color:'+color+'"><span style="display:none">'+color+'</span></div></button>');
      }
      $('#canvas_properties .colorbtns').append(' <span id="num_selected_colors">0</span>色読み込む');
      $('button.preview_color').click(function(e){
        // toggling manually because automatic toggling 
        // would happen after generatPreview()
        if($(this).hasClass('active')) {
          $(this).removeClass('active');
          $(this).removeClass('active-strong');
        } else {
          $(this).addClass('active');         
          $(this).addClass('active-strong');          
        }
        generatePreview();
      });

      // default selections for pass widgets, lasertags handling
      if (data.lasertags) {
        $().uxmessage('notice', "lasertags -> applying defaults");
        DataHandler.setPassesFromLasertags(data.lasertags);
      }
      // actually redraw right now 
      generatePreview();      
    } else {
      $().uxmessage('notice', "指定したファイルには、データがありません。");
    }   
  }


  function generatePreview() {
    if (!DataHandler.isEmpty()) {
      DataHandler.draw(canvas, app_settings.to_canvas_scale, getDeselectedColors());
    } else {
      $().uxmessage('notice', "No data loaded to generate preview.");
    }       
  }


  function getDeselectedColors() {
    var num_selected = 0;
    var exclude_colors = {};
    $('#canvas_properties .colorbtns button').each(function(index) {
      if (!($(this).hasClass('active'))) {
        exclude_colors[$(this).find('div span').text()] = true;
      } else {
        num_selected += 1;
      }
    });
    $('#num_selected_colors').html(''+num_selected);
    return exclude_colors;
  }


  // forwarding file open click
  $('#file_import_btn').click(function(e){
    path_optimize = 1;
    $('#svg_upload_file').trigger('click');
  });  
  $('#svg_import_72_btn').click(function(e){
    path_optimize = 1;
    forceSvgDpiTo = 72;
    $('#svg_upload_file').trigger('click');
    return false;
  });
  $('#svg_import_90_btn').click(function(e){
    path_optimize = 1;
    forceSvgDpiTo = 90;
    $('#svg_upload_file').trigger('click');
    return false;
  });
  $('#svg_import_96_btn').click(function(e){
    path_optimize = 1;
    forceSvgDpiTo = 96;
    $('#svg_upload_file').trigger('click');
    return false;
  });    

  
  // setting up add to queue button
  $("#import_to_queue").click(function(e) {
    if (!(DataHandler.isEmpty())) {     
      var jobdata = DataHandler.getJson(getDeselectedColors());
      var filename = $('#import_name').val();
      save_and_add_to_job_queue(filename, jobdata);
      load_into_job_widget(filename, jobdata);
      $('#tab_jobs_button').trigger('click');

      // reset tap
      $('#canvas_properties .colorbtns').html('');  // reset colors
      canvas.background('#ffffff');
      $('#dpi_import_info').html('読み込み可能ファイル: <b>SVG</b>, <b>DXF</b>');
      $('#import_name').val('');
    } else {
      $().uxmessage('warning', "データがありません。");
    }
    return false;
  });



});  // ready
