# coding: UTF-8

import sys, os, time
import glob, json, argparse, copy
import tempfile
import socket, webbrowser
from wsgiref.simple_server import WSGIRequestHandler, make_server
from bottle import *
from serial_manager import SerialManager
from filereaders import read_svg, read_dxf, read_ngc
import threading
import urllib
import subprocess


#################################################
## リモートデバッグ
#import ptvsd
#ptvsd.enable_attach(secret = 'fabool')
#if os != 'Windows':
#    ptvsd.wait_for_attach()
#################################################

APPNAME = "FABOOLLaser"
VERSION = "1.0.0"
COMPANY_NAME = "smartdiys"
SERIAL_PORT = None
BITSPERSECOND = 57600
NETWORK_PORT = 4444
TOLERANCE = 0.08
FIRMWARE_FLG = False
CONNECT_THREAD_EXEC_FLG = False

if os.name == 'nt': #sys.platform == 'win32': 
    GUESS_PREFIX = "Arduino"   
elif os.name == 'posix':
    if sys.platform == "linux" or sys.platform == "linux2":
        GUESS_PREFIX = "ttyACM"
    elif sys.platform == "darwin":
        GUESS_PREFIX = "tty.usbmodem"    

else:
    GUESS_PREFIX = "no prefix"    

class ConnectThread(threading.Thread):
    def __init__(self):
        threading.Thread.__init__(self)

    def run(self):

        global SERIAL_PORT

        SerialManager.cancel_queue();

        SERIAL_PORT = SerialManager.match_device(GUESS_PREFIX, BITSPERSECOND)
        if SERIAL_PORT is not None:
            SerialManager.connect(SERIAL_PORT, BITSPERSECOND)

        global CONNECT_THREAD_EXEC_FLG
        CONNECT_THREAD_EXEC_FLG = False


def resources_dir():
    """This is to be used with all relative file access.
       _MEIPASS is a special location for data files when creating
       standalone, single file python apps with pyInstaller.
       Standalone is created by calling from 'other' directory:
       python pyinstaller/pyinstaller.py --onefile app.spec
    """
    if hasattr(sys, "_MEIPASS"):
        return sys._MEIPASS
    else:
        # root is one up from this file
        return os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../'))
        
        
def storage_dir():
    directory = ""
    if sys.platform == 'darwin':
        # from AppKit import NSSearchPathForDirectoriesInDomains
        # # NSApplicationSupportDirectory = 14
        # # NSUserDomainMask = 1
        # # True for expanding the tilde into a fully qualified path
        # appdata = path.join(NSSearchPathForDirectoriesInDomains(14, 1, True)[0], APPNAME)
        directory = os.path.join(os.path.expanduser('~'), 'Library', 'Application Support', COMPANY_NAME, APPNAME)
    elif sys.platform == 'win32':
        directory = os.path.join(os.path.expandvars('%APPDATA%'), COMPANY_NAME, APPNAME)
    else:
        directory = os.path.join(os.path.expanduser('~'), "." + APPNAME)
        
    if not os.path.exists(directory):
        os.makedirs(directory)
        
    return directory


class HackedWSGIRequestHandler(WSGIRequestHandler):
    """ This is a heck to solve super slow request handling
    on the BeagleBone and RaspberryPi. The problem is WSGIRequestHandler
    which does a reverse lookup on every request calling gethostbyaddr.
    For some reason this is super slow when connected to the LAN.
    (adding the IP and name of the requester in the /etc/hosts file
    solves the problem but obviously is not practical)
    """
    def address_string(self):
        """Instead of calling getfqdn -> gethostbyaddr we ignore."""
        # return "(a requester)"
        return str(self.client_address[0])


def run_with_callback(host, port):
    """ Start a wsgiref server instance with control over the main loop.
        This is a function that I derived from the bottle.py run()
    """
    handler = default_app()
    server = make_server(host, port, handler, handler_class=HackedWSGIRequestHandler)
    server.timeout = 0.01
    server.quiet = True
    print "Persistent storage root is: " + storage_dir()
    print "-----------------------------------------------------------------------------"
    print "Bottle server starting up ..."
    print "Serial is set to %d bps" % BITSPERSECOND
    print "Point your browser to: "    
    print "http://%s:%d/      (local)" % ('127.0.0.1', port)  
    print "Use Ctrl-C to quit."
    print "-----------------------------------------------------------------------------"
    print

    global FIRMWARE_FLG
    global CONNECT_THREAD_EXEC_FLG
    sys.stdout.flush()  # make sure everything gets flushed

    while 1:
        try:
            if FIRMWARE_FLG == False:
                if SerialManager.is_connected():
                    SerialManager.send_queue_as_ready()
                else:
                    if CONNECT_THREAD_EXEC_FLG == False:
                        CONNECT_THREAD_EXEC_FLG = True
                        thConnect = ConnectThread()
                        thConnect.start()

            server.handle_request()
        except KeyboardInterrupt:
            break
    print "\nShutting down..."
    SerialManager.close()
    # LinuxだけUSBをリセットする
    if os.name == 'posix' and (sys.platform == "linux" or sys.platform == "linux2"):
        try:
            import fcntl

            lsusb_out = subprocess.Popen("lsusb | grep -i STMicroelectronics", shell=True, bufsize=64, stdin=subprocess.PIPE, stdout=subprocess.PIPE, close_fds=True).stdout.read().strip().split()
            bus = lsusb_out[1]
            device = lsusb_out[3][:-1]
            f = open("/dev/bus/usb/%s/%s"%(lsusb_out[1], lsusb_out[3][:-1]), 'w', os.O_WRONLY)
            USBDEVFS_RESET= 21780
            fcntl.ioctl(f, USBDEVFS_RESET, 0)
        except:
            pass


### クロスドメイン対応

@hook('after_request')
def enable_cors():
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Origin, Accept, Content-Type, X-Requested-With, X-CSRF-Token'


### Front End

@route('/css/:path#.+#')
def static_css_handler(path):
    return static_file(path, root=os.path.join(resources_dir(), 'frontend/css'))
    
@route('/js/:path#.+#')
def static_js_handler(path):
    return static_file(path, root=os.path.join(resources_dir(), 'frontend/js'))
    
@route('/img/:path#.+#')
def static_img_handler(path):
    return static_file(path, root=os.path.join(resources_dir(), 'frontend/img'))

@route('/favicon.ico')
def favicon_handler():
    return static_file('favicon.ico', root=os.path.join(resources_dir(), 'frontend/img'))
    

### LIBRARY

@route('/library/get/:path#.+#')
def static_library_handler(path):
    return static_file(path, root=os.path.join(resources_dir(), 'library'), mimetype='text/plain')
    
@route('/library/list')
def library_list_handler():
    # return a json list of file names
    file_list = []
    cwd_temp = os.getcwd()
    try:
        os.chdir(os.path.join(resources_dir(), 'library'))
        file_list = glob.glob('*')
    finally:
        os.chdir(cwd_temp)
    return json.dumps(file_list)



### QUEUE

def encode_filename(name):
    str(time.time()) + '-' + base64.urlsafe_b64encode(name)
    
def decode_filename(name):
    index = name.find('-')
    return base64.urlsafe_b64decode(name[index+1:])
    

@route('/queue/get/:name#.+#')
def static_queue_handler(name): 
    return static_file(name, root=storage_dir(), mimetype='text/plain')


@route('/queue/list')
def library_list_handler():
    # base64.urlsafe_b64encode()
    # base64.urlsafe_b64decode()
    # return a json list of file names
    files = []
    cwd_temp = os.getcwd()
    try:
        os.chdir(storage_dir())
        files = filter(os.path.isfile, glob.glob("*"))
        files.sort(key=lambda x: os.path.getmtime(x))
    finally:
        os.chdir(cwd_temp)
    return json.dumps(files)
    
@route('/queue/save', method='POST')
def queue_save_handler():
    ret = '0'
    if 'job_name' in request.forms and 'job_data' in request.forms:
        name = request.forms.get('job_name')
        job_data = request.forms.get('job_data')
        filename = os.path.abspath(os.path.join(storage_dir(), name.strip('/\\')))
        if os.path.exists(filename) or os.path.exists(filename+'.starred'):
            return "file_exists"
        try:
            fp = open(filename, 'w')
            fp.write(job_data)
            print "file saved: " + filename
            ret = '1'
        finally:
            fp.close()
    else:
        print "error: save failed, invalid POST request"
    return ret

@route('/queue/rm/:name')
def queue_rm_handler(name):
    # delete queue item, on success return '1'
    ret = '0'
    filename = os.path.abspath(os.path.join(storage_dir(), name.strip('/\\')))
    if filename.startswith(storage_dir()):
        if os.path.exists(filename):
            try:
                os.remove(filename);
                print "file deleted: " + filename
                ret = '1'
            finally:
                pass
    return ret 

@route('/queue/clear')
def queue_clear_handler():
    # delete all queue items, on success return '1'
    ret = '0'
    files = []
    cwd_temp = os.getcwd()
    try:
        os.chdir(storage_dir())
        files = filter(os.path.isfile, glob.glob("*"))
        files.sort(key=lambda x: os.path.getmtime(x))
    finally:
        os.chdir(cwd_temp)
    for filename in files:
        if not filename.endswith('.starred'):
            filename = os.path.join(storage_dir(), filename)
            try:
                os.remove(filename);
                print "file deleted: " + filename
                ret = '1'
            finally:
                pass
    return ret
    
@route('/queue/star/:name')
def queue_star_handler(name):
    ret = '0'
    filename = os.path.abspath(os.path.join(storage_dir(), name.strip('/\\')))
    if filename.startswith(storage_dir()):
        if os.path.exists(filename):
            os.rename(filename, filename + '.starred')
            ret = '1'
    return ret    

@route('/queue/unstar/:name')
def queue_unstar_handler(name):
    ret = '0'
    filename = os.path.abspath(os.path.join(storage_dir(), name.strip('/\\')))
    if filename.startswith(storage_dir()):
        if os.path.exists(filename + '.starred'):
            os.rename(filename + '.starred', filename)
            ret = '1'
    return ret 




@route('/')
@route('/index.html')
@route('/app.html')
def default_handler():
    return static_file('app.html', root=os.path.join(resources_dir(), 'frontend') )


@route('/stash_download', method='POST')
def stash_download():
    """Create a download file event from string."""
    filedata = request.forms.get('filedata')
    fp = tempfile.NamedTemporaryFile(mode='w', delete=False)
    filename = fp.name
    with fp:
        fp.write(filedata)
        fp.close()
    print filedata
    print "file stashed: " + os.path.basename(filename)
    return os.path.basename(filename)

@route('/download/:filename/:dlname')
def download(filename, dlname):
    print "requesting: " + filename
    return static_file(filename, root=tempfile.gettempdir(), download=dlname)

  
@route('/dfu_firmware_download', method='POST')
def dfu_firmware_download():
    # URL取得
    downloadurl = request.forms.get('downloadurl')
    # ファームウェア保存先
    urllist = downloadurl.split("/")
    firmwarepath = tempfile.gettempdir() + os.sep + urllist[len(urllist)-1]

    # ダウンロード
    try:
        urllib.urlretrieve(downloadurl, firmwarepath)
    except IOError:
        return ""

    return firmwarepath


@route('/dfu_firmware_flash', method='POST')
def dfu_firmware_flash():
    global FIRMWARE_FLG
    commandret = '1'

    # ファームウェアのパス取得
    firmwarepath = request.forms.get('firmwarepath')
    # コマンド待ち時間取得
    waittime = request.forms.get('waittime')

    # シリアルポートOpen処理を停止する
    FIRMWARE_FLG = True

    # シリアルポートを閉じる
    if SerialManager.is_connected():
        SerialManager.close()

    # コマンド実行
    if sys.platform == "darwin":  # OSX
        command = os.path.abspath(os.path.dirname(__file__)) + "/dfu/bin/dfu-util -a 0 -D " + firmwarepath
        try:
            flashret = subprocess.call(command, shell=True)
        except OSError:
            commandret = '0'
        if flashret != 0:
            commandret = '0'

    elif sys.platform == "win32": # Windows
        command = os.path.abspath(os.path.dirname(__file__)) + "\\DfuSe\\Bin\\DfuSeCommand.exe -c -d --fn " + firmwarepath
        try:
            process = subprocess.Popen(command, shell=True)
            iCnt = 0
            while process.poll() is None:
                time.sleep(0.1)
                iCnt = iCnt + 1
                if iCnt > waittime:
                    process.kill();
                    commandret = '0'
                    break
        except OSError:
            commandret = '0'

    elif sys.platform == "linux" or sys.platform == "linux2":  #Linux
        # Linuxではファームウェアの更新に対応しない
        commandret = '0'


    # シリアルポートOpen処理を再開する
    FIRMWARE_FLG = False

    return commandret


@route('/version')
def get_version():
    status = copy.deepcopy(SerialManager.get_hardware_status())

    version = {
        'os': sys.platform,
        'firmware_version': status['firmware_version'],
        'grbl_name': status['grbl_name'],
        'app_version': VERSION
    }

    return json.dumps(version)

@route('/serial/:connect')
def serial_handler(connect):
    if connect == '1':
        # print 'js is asking to connect serial'      
# D:Window10 Start
        #if not SerialManager.is_connected():
# D:Window10 End
            try:
                global SERIAL_PORT, BITSPERSECOND, GUESS_PREFIX
                if not SERIAL_PORT:
                    SERIAL_PORT = SerialManager.match_device(GUESS_PREFIX, BITSPERSECOND)
                SerialManager.connect(SERIAL_PORT, BITSPERSECOND)
                ret = "Serial connected to %s:%d." % (SERIAL_PORT, BITSPERSECOND)  + '<br>'
                time.sleep(1.0) # allow some time to receive a prompt/welcome
                SerialManager.flush_input()
                SerialManager.flush_output()
                return ret
            except serial.SerialException:
                SERIAL_PORT = None
                print "Failed to connect to serial."    
                return ""          
    elif connect == '0':
        # print 'js is asking to close serial'    
        if SerialManager.is_connected():
            if SerialManager.close(): return "1"
            else: return ""  
    elif connect == "2":
        # print 'js is asking if serial connected'
        if SerialManager.is_connected(): return "1"
        else: return ""
    else:
        print 'ambigious connect request from js: ' + connect            
        return ""



@route('/status')
def get_status():
    status = copy.deepcopy(SerialManager.get_hardware_status())
    status['serial_connected'] = SerialManager.is_connected()
    status['lasaurapp_version'] = VERSION
    return json.dumps(status)


@route('/pause/:flag')
def set_pause(flag):
    # returns pause status
    if flag == '1':
        if SerialManager.set_pause(True):
            print "pausing ..."
            return '1'
        else:
            return '0'
    elif flag == '0':
        print "resuming ..."
        if SerialManager.set_pause(False):
            return '1'
        else:
            return '0'

@route('/gcode', method='POST')
def job_submit_handler():
    job_data = request.forms.get('job_data')
    if job_data and SerialManager.is_connected():
        lines = job_data.split('\n')
        print "Adding to queue %s lines" % len(lines)
        for line in lines:
            SerialManager.queue_gcode_line(line)
        return "__ok__"
    else:
        return "serial disconnected"

@route('/queue_pct_done')
def queue_pct_done_handler():
    return SerialManager.get_queue_percentage_done()


@route('/file_reader', method='POST')
def file_reader():
    """Parse SVG string."""
    filename = request.forms.get('filename')
    filedata = request.forms.get('filedata')
    dimensions = request.forms.get('dimensions')
    try:
        dimensions = json.loads(dimensions)
    except TypeError:
        dimensions = None
    # print "dims", dimensions[0], ":", dimensions[1]


    dpi_forced = None
    try:
        dpi_forced = float(request.forms.get('dpi'))
    except:
        pass

    optimize = True
    try:
        optimize = bool(int(request.forms.get('optimize')))
    except:
        pass

    if filename and filedata:
        print "You uploaded %s (%d bytes)." % (filename, len(filedata))
        if filename[-4:] in ['.dxf', '.DXF']: 
            res = read_dxf(filedata, TOLERANCE, optimize)
        elif filename[-4:] in ['.svg', '.SVG']: 
            res = read_svg(filedata, dimensions, TOLERANCE, dpi_forced, optimize)
        elif filename[-4:] in ['.ngc', '.NGC']:
            res = read_ngc(filedata, TOLERANCE, optimize)
        else:
            print "error: unsupported file format"

        # print boundarys
        jsondata = json.dumps(res)
        # print "returning %d items as %d bytes." % (len(res['boundarys']), len(jsondata))
        return jsondata
    return "You missed a field."


### Setup Argument Parser
argparser = argparse.ArgumentParser(description='Run FABOOLLaser.', prog='faboollaser')
argparser.add_argument('port', metavar='serial_port', nargs='?', default=False,
                    help='serial port to the Lasersaur')
argparser.add_argument('-v', '--version', action='version', version='%(prog)s ' + VERSION)
argparser.add_argument('-p', '--public', dest='host_on_all_interfaces', action='store_true',
                    default=False, help='bind to all network devices (default: bind to 127.0.0.1)')
argparser.add_argument('-l', '--list', dest='list_serial_devices', action='store_true',
                    default=False, help='list all serial devices currently connected')
argparser.add_argument('-d', '--debug', dest='debug', action='store_true',
                    default=False, help='print more verbose for debugging')
argparser.add_argument('-m', '--match', dest='match',
                    default=GUESS_PREFIX, help='match serial device with this string')                                        
args = argparser.parse_args()



print "FABOOLLaser " + VERSION

if args.list_serial_devices:
    SerialManager.list_devices(BITSPERSECOND)
else:
    # run
    if args.debug:
        debug(True)
        if hasattr(sys, "_MEIPASS"):
            print "Data root is: " + sys._MEIPASS             

    if args.host_on_all_interfaces:
        run_with_callback('', NETWORK_PORT)
    else:
        run_with_callback('127.0.0.1', NETWORK_PORT)    


