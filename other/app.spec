#!/usr/bin/python
# -*- mode: python -*-

import os, sys
from glob import glob

resource_files = []
def add_resource_files(file_list):
    global resource_files
    for resfile in file_list:
        resource_files.append( (os.path.relpath(resfile,'../'), resfile, 'DATA') )    

### files to pack into the executable
add_resource_files( glob('../frontend/app.html') )
add_resource_files( glob('../frontend/css/*.css') )
add_resource_files( glob('../frontend/css/smoothness/*.css') )
add_resource_files( glob('../frontend/css/smoothness/images/*.png') )
add_resource_files( glob('../frontend/img/*') )
add_resource_files( glob('../frontend/js/*') )
add_resource_files( glob('../library/*.lsa') )


a = Analysis(['../backend/app.py'],
             pathex=[os.path.abspath(sys.argv[0])],
             hiddenimports=[],
             hookspath=None)
pyz = PYZ(a.pure)


target_location = os.path.join('dist', 'lasaurapp')
if sys.platform == "darwin":
    target_location = os.path.join('dist_osx', 'faboollaser')
    exe = EXE(pyz,
              a.scripts,
              exclude_binaries=1,
              name=os.path.join('build/pyi.darwin/app', 'app'),
              debug=False,
              strip=None,
              upx=True,
              console=True )
    coll = COLLECT(exe,
                   a.binaries,
                   a.zipfiles,
                   a.datas + resource_files,
                   strip=None,
                   upx=True,
                   name=target_location)    
    app = BUNDLE(coll,
                 name=target_location + '.app')
                     
elif sys.platform == "win32":
    target_location = os.path.join('dist_win', 'faboollaser.exe')
    exe = EXE(pyz,
              a.scripts,
              a.binaries,
              a.zipfiles,
              a.datas + resource_files,
              name=target_location,
              debug=False,
              strip=None,
              upx=True,
              console=True ) 
    
elif sys.platform == "linux" or sys.platform == "linux2":
    target_location = os.path.join('dist_linux', 'faboollaser')
    exe = EXE(pyz,
              a.scripts,
              a.binaries,
              a.zipfiles,
              a.datas + resource_files,
              name=target_location,
              debug=False,
              strip=None,
              upx=True,
              console=True ) 


             