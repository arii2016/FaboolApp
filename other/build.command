#!/bin/bash
cd `dirname $0`
pyinstaller --onefile app.spec
