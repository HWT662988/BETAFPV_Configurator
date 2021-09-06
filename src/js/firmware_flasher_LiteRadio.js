
const os = require('os')
const path = require('path')

var jsonFile = require('jsonfile')
var jsonfileName = 'LiteRadio.json'


const firmware_flasher_LiteRadio ={
    localFirmwareLoaded: false,
    selectedBoard: undefined,
    boardNeedsVerification: false,
    intel_hex: undefined, // standard intel hex in string format
    parsed_hex: undefined, // parsed raw hex in array format
    unifiedTarget: {}, // the Unified Target configuration to be spliced into the configuration
    isConfigLocal: false, // Set to true if the user loads one locally
    developmentFirmwareLoaded: false, // Is the firmware to be flashed from the development branch?
};

firmware_flasher_LiteRadio.FLASH_MESSAGE_TYPES = {
    NEUTRAL : 'NEUTRAL',
    VALID   : 'VALID',
    INVALID : 'INVALID',
    ACTION  : 'ACTION',
};

const { Console } = require('console');
const { CONNREFUSED } = require('dns');
const fs = require('fs');


let port = null;
let binFile = null;
let binFilePath=null;
let packLen = 0;

let strFileName = null;
let lastSize=0;
let binSize=null;
let packNum=1;
let ack = null;
let starting=null;

firmware_flasher_LiteRadio.flashingMessage = function(message, type) {
    let self = this;

    let progressLabel_e = $('span.progressLabel');
    switch (type) {
        case self.FLASH_MESSAGE_TYPES.VALID:
            progressLabel_e.removeClass('invalid actionRequired')
                           .addClass('valid');
            break;
        case self.FLASH_MESSAGE_TYPES.INVALID:
            progressLabel_e.removeClass('valid actionRequired')
                           .addClass('invalid');
            break;
        case self.FLASH_MESSAGE_TYPES.ACTION:
            progressLabel_e.removeClass('valid invalid')
                           .addClass('actionRequired');
            break;
        case self.FLASH_MESSAGE_TYPES.NEUTRAL:
        default:
            progressLabel_e.removeClass('valid invalid actionRequired');
            break;
    }
    if (message !== null) {
        progressLabel_e.html(message);
    }

    return self;
};

firmware_flasher_LiteRadio.enableFlashing = function (enabled) {
    if (enabled) {
        $('a.flash_firmware').removeClass('disabled');
    } else {
        $('a.flash_firmware').addClass('disabled');
    }
};

firmware_flasher_LiteRadio.flashProgress = function(value) {
    $('.progress').val(value);

    return this;
};

function isExistOption2(id,value) {  
    var isExist = false;  
    var count = $('#'+id).find('option').length;  

      for(var i=0;i<count;i++)     
      {     
         if($('#'+id).get(0).options[i].value == value)     
        {     
            isExist = true;     
            break;     
        }     
    }     
    return isExist;  
} 

function addOptionValue2(id,value,text) {  
    if(!isExistOption2(id,value)){$('#'+id).append("<option value="+value+">"+text+"</option>");}      
} 

function readJsonFile(fileName){
    jsonFile.readFile(fileName, function(err, jsonData) {
        if (err) throw err;
    
        for (var i = 0; i < jsonData.length; ++i) {
          console.log("name: "+jsonData[i].name);
          console.log("version: "+jsonData[i].version);

          addOptionValue2('boardTarget',i,jsonData[i].name);
          addOptionValue2('boardVersion',i,jsonData[i].version);

          console.log("----------------------------------"); 
        }
    });
}

function loadRemoteJsonFile(){
    //https://github.com/BETAFPV/BETAFPV.github.io/releases/download/v1/board.json
    var xhr = new XMLHttpRequest();
    xhr.open('GET', "https://github.com/BETAFPV/BETAFPV.github.io/releases/download/v1/LiteRadio.json", true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function(e) {
        var array = new Uint8Array(xhr.response);
        var tempFile = path.join(__dirname, "./LiteRadio.json");
        console.log(tempFile);

        fs.writeFile(tempFile, array, "utf8",(err)=>{
            if(err){
                console.log("error");
            }else {
                console.log("ok");
                readJsonFile(jsonfileName);
            }
        })
    };
    xhr.send();

}

function CRC16_Check(puData)
{
    var len = puData.length;

    if (len > 0) {
        var crc = 0x0000;

        for (var i = 0; i < 1024; i++) {
            crc = (crc ^ ((puData[3+i])<<8 & 0xff00 ));
            
            for (var j = 0; j < 8; j++) {
                if(crc & 0x8000)
                    crc = (crc<<1)^0x1021;    //CRC-ITU
                else
                    crc = crc<<1;
            }
            crc &=0xffff;
        }

        var hi = (crc>>8)&0xFF;  //高位置
        var lo = (crc & 0xFF);         //低位置

        puData[1027] = hi;
        puData[1028] = lo;
    }
}


function CRC16_Name(puData)
{
    var len = puData.length;

    if (len > 0) {
        var crc = 0x0000;

        for (var i = 0; i < 128; i++) {
            crc = (crc ^ ((puData[3+i])<<8 & 0xff00 ));
            
            for (var j = 0; j < 8; j++) {
                if(crc & 0x8000)
                    crc = (crc<<1)^0x1021;    //CRC-ITU
                else
                    crc = crc<<1;
            }
            crc &=0xffff;
        }

        var hi = (crc>>8)&0xFF;  //高位置
        var lo = (crc & 0xFF);         //低位置

        puData[131] = hi;
        puData[132] = lo;
    }
}

firmware_flasher_LiteRadio.initialize = function (callback) {
    const self = this;
    self.enableFlashing(false);

    $('div.connect_controls a.connect').click(function () {
        if (GUI.connect_lock != true) { 
            const thisElement = $(this);
            const clicks = thisElement.data('clicks');
            
            const toggleStatus = function() {
                thisElement.data("clicks", !clicks);
            };

            GUI.configuration_loaded = false;

            const selected_baud = parseInt($('div#port-picker #baud').val());

            let COM = ($('div#port-picker #port option:selected').text());

            console.log(COM);
            console.log(selected_baud);

            port = new serialport(COM, {
                baudRate: parseInt(selected_baud),
                dataBits: 8,
                parity: 'none',
                stopBits: 1
            });
            
            //open事件监听
            port.on('open', () =>{
                console.log('serialport open success LiteRadio')
                //timerRev = setInterval(wrapEvent,250);

                GUI.connect_lock = true;
                $('div#connectbutton a.connect').addClass('active');
            });

            //close事件监听
            port.on('close', () =>{
                console.log('serialport close success')
            });

            //data事件监听
            port.on('data', data => {
                if(starting ==1)
                {
                    if(data[0] == 67)
                    {
                        var bufName = new Buffer(133);

                        bufName[0] = 0x01;
                        bufName[1] = 00;
                        bufName[2] = 0xFF;
                        bufName[3] = 0x42;
                        bufName[4] = 0x6f;
                        bufName[5] = 0x6f;
                        bufName[6] = 0x74;
                        bufName[7] = 0x6c;
                        bufName[8] = 0x6f;
                        bufName[9] = 0x61;
                        bufName[10] = 0x64;
                        bufName[11] = 0x65;
                        bufName[12] = 0x72;
                        bufName[13] = 0x5f;
                        bufName[14] = 0x46;
                        bufName[15] = 0x2e;
                        bufName[16] = 0x62;
                        bufName[17] = 0x69;
                        bufName[18] = 0x6e;
                        bufName[19] = 0x00;
                        
                        
                        
                        var str = binSize.toString();
                        var sizeLen = str.length;

                        for(var i=0;i<sizeLen;i++)
                        {
                            var value = str.charCodeAt(i).toString(10);
                            bufName[20+i] = value;
                        }

                        CRC16_Name(bufName);

                        console.log(bufName);
                        
                        port.write(bufName, (err) =>{
                            if (err) return console.log('write Error: ', err.message);
                        });

                        starting =2;

                        firmware_flasher_LiteRadio.flashingMessage("Erasing ...",self.FLASH_MESSAGE_TYPES.NEUTRAL);
                    }
                }
                else{
                    if(starting ==2)
                    {
                        if(data[0] == 6)
                        {        
                            var bufData = new Buffer(1029);

                            fs.open(binFilePath, 'r', function(err, fd){
                                if (err) {
                                    return console.error(err);
                                }
                                console.log("File opened successfully! LiteRadio");
                        
                                lastSize = binSize - (packNum-1)*1024;
                                console.log("lastSize:",lastSize);
                        
                                if(lastSize>0)
                                {
                                    bufData[0] = 0x02;
                                    bufData[1] = packNum;
                                    bufData[2] = ~packNum;
                    
                                    console.log("lastSize:",lastSize);

                                    fs.read(fd, bufData, 3, 1024, (packNum-1)*1024, function(err, bytes){
                                        if (err){
                                            console.log(err);
                                            }
                                            console.log(bytes + " bytes read");
                                            
                                            CRC16_Check(bufData);

                                            // Print only read bytes to avoid junk.
                                            if(bytes > 0){
                                            port.write(bufData, (err) =>{
                                                if (err) return console.log('write Error: ', err.message);
                                            });
                                            packNum ++;
                                        }
                                    });  

                                    if(lastSize<1024)
                                    {
                                        starting = 3;
                                    }
                                }  
                                    
                            });

                            firmware_flasher_LiteRadio.flashingMessage("Flashing ...",self.FLASH_MESSAGE_TYPES.NEUTRAL);
                            firmware_flasher_LiteRadio.flashProgress(packNum/packLen*100);
                        }
                    }
                    else if(starting ==4)
                    {
                        console.log(data);
                        if(data[0] == 21)
                        {
                            var buf = new Buffer(133);

                            buf[0] = 0x01;
                            buf[1] = 0x00;
                            buf[2] = 0xff;
                            port.write(buf, (err) =>{
                                if (err) return console.log('write Error: ', err.message);
                            });
                            
                            console.log("EOT3 LiteRadio");

                            firmware_flasher_LiteRadio.flashingMessage("Programming: SUCCESSFUL",self.FLASH_MESSAGE_TYPES.VALID);
                            $('a.exit_dfu').removeClass('disabled');
                        }
                    }
                    else if(starting ==3)
                    {
                        console.log(data);
                        
                        if(data[0] == 6)
                        {
                            var buf = new Buffer(1);
                            buf[0] = 0x04;

                            port.write(buf, (err) =>{
                                if (err) return console.log('write Error: ', err.message);
                            });
                            starting = 4;
                            console.log("EOT LiteRadio");

                            firmware_flasher_LiteRadio.flashingMessage("Verifying ...",self.FLASH_MESSAGE_TYPES.NEUTRAL);
                        }         
                    }
                }
            });

            //error事件监听
            port.on('error',function(err){
                console.log('Error: ',err.message);
            });
        }
        else
        {
            port.close();
            
            GUI.connect_lock = false;
            $('div#connectbutton a.connect').removeClass('active');
        }
    });

    $('#content').load("./src/html/firmware_flasher_LiteRadio.html", function () {

        $('a.load_file').click(function () {
  
            const { dialog } = require('electron').remote;
            dialog.showOpenDialog({
                title: "openFile",
                defaultPath: "",
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: 'target files', extensions: ['bin'] },
                ]
            }).then(result => {
                binFilePath = result.filePaths[0];
                strFileName = binFilePath.substring(binFilePath.lastIndexOf("\\")+1); 
                   
                fs.readFile(result.filePaths[0], (err, binFile) => {
                    if (err) {
                        alert(err)
                    } else {
                        self.enableFlashing(true);
                        binSize = binFile.length;

                        packLen = Math.round(binSize / 1024);

                        firmware_flasher_LiteRadio.flashingMessage("Loaded Local Firmware : ( "+ binFile.length +"bytes )",self.FLASH_MESSAGE_TYPES.NEUTRAL);
                    }
                });
    
            }).catch(err => {
                console.log(err)
            })

        });

        
        $('a.flash_firmware').click(function () {
            if (!$(this).hasClass('disabled')) {

                var buf = Buffer(8);
                buf[0] = 0x75;
                buf[1] = 0x70;
                buf[2] = 0x64;
                buf[3] = 0x61;
                buf[4] = 0x74;
                buf[5] = 0x65;
                buf[6] = 0x0d;
                buf[7] = 0x0a;

                port.write(buf, (err) =>{
                    if (err) return console.log('write Error: ', err.message);
                });

                $("a.load_file").addClass('disabled');

                firmware_flasher_LiteRadio.flashProgress(0);
                self.enableFlashing(false);
                starting = 1;
            }
        });
        
        $('a.load_remote_file').click(function () {
            if (!$(this).hasClass('disabled')) {
                console.log("click");

                let targetBoardSelected = ($('#boardTarget option:selected').text());
                let targetVersionSelected = ($('#boardVersion option:selected').text());
                console.log(targetBoardSelected);
                console.log(targetVersionSelected);

                var str = targetBoardSelected + "_" + targetVersionSelected + ".bin";
                console.log(str);
                 
                var urlValue = "https://github.com/BETAFPV/BETAFPV.github.io/releases/download/v1/" + str;
                console.log(urlValue);

                var xhr = new XMLHttpRequest();
                xhr.open('GET', urlValue, true);
                xhr.responseType = 'arraybuffer';
                xhr.onload = function(e) {
                    var array = new Uint8Array(xhr.response);

                    fs.writeFile(path.join(__dirname, str), array, "utf8",(err)=>{
                        if(err){
                            console.log("error");
                        }else {
                            console.log("ok");
                            binFilePath = path.join(__dirname, str);
                            fs.readFile(binFilePath, (err, binFile) => {
                                if (err) {
                                    alert(err)
                                } else {
                                    self.enableFlashing(true);
                                    binSize = binFile.length;
            
                                    packLen = Math.round(binSize / 1024);
            
                                    firmware_flasher_LiteRadio.flashingMessage("Loaded Local Firmware : ( "+ binFile.length +"bytes )",self.FLASH_MESSAGE_TYPES.NEUTRAL);
                                }
                            });

                        }
                    })
                };
                xhr.send();
            }
        });

        loadRemoteJsonFile();
        callback();
    });

};

