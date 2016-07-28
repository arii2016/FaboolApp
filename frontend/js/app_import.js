


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

// C:FABOOL Start
//    $.ajax({       +
//      type: "POST",        +    var geo_boundarys = SVGReader.parse(filedata, {'optimize':path_optimize, 'dpi':forceSvgDpiTo})
//      url: "/file_reader",         +    handleParsedGeometry(geo_boundarys);
//      data: {'filename':filename,      +
//             'filedata':filedata,          +    $('#file_import_btn').button('reset');
//             'dpi':forceSvgDpiTo,          +    forceSvgDpiTo = undefined;  // reset
//             'optimize':path_optimize,         +
//             'dimensions':JSON.stringify(app_settings.work_area_dimensions)},     
//      dataType: "json",       
//      success: function (data) {      
//        if (ext == '.svg' || ext == '.SVG') {     
//          $().uxmessage('success', "SVG解析完了.");       
//          $('#dpi_import_info').html('ピクセル単位を<b>' + data.dpi + 'dpi</b>で変換');       
//        } else if (ext == '.dxf' || ext == '.DXF') {      
//          $().uxmessage('success', "DXF解析完了.");       
//          $('#dpi_import_info').html('単位mmでDXFファイルを読み込み');        
//        } else if (ext == '.ngc' || ext == '.NGC') {      
//          $().uxmessage('success', "Gコード解析完了.");       
//        } else {      
//          $().uxmessage('warning', "指定のファイルはサポートしていません。SVG、DXF、Gコードファイルを指定してください。");        
//        }     
//        // alert(JSON.stringify(data));       
//        handleParsedGeometry(data);       
//      },      
//      error: function (data) {        
//        $().uxmessage('error', "バックエンドエラー");     
//      },      
//      complete: function (data) {     
//        $('#file_import_btn').button('reset');        
//        forceSvgDpiTo = undefined;  // reset      
//      }       
//    });
    var geo_boundarys = SVGReader.parse(filedata, {'optimize':path_optimize, 'dpi':forceSvgDpiTo, 'target_size':JSON.stringify(app_settings.work_area_dimensions)})

    if (geo_boundarys.rasters.length > 0) {
        LoadImageData(geo_boundarys);
    }
    else {
        handleParsedGeometry(geo_boundarys);
    }
    $('#file_import_btn').button('reset');
    forceSvgDpiTo = undefined;  // reset

// C:FABOOL End

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
