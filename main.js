/* jshint -W097 */ // jshint strict:false
/*jslint node: true */
"use strict";

// you have to require the utils module and call adapter function
var utils = require(__dirname + '/lib/utils'); // Get common adapter utils
var adapter = utils.adapter('landroid-s');
var LandroidCloud = require(__dirname + '/lib/landroid-cloud');
var landroidS = require(__dirname + '/responses/landroid-s.json');

var ip, pin, data, getOptions, error, state;
var firstSet = true;
var landroid;

var weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
var test = true; // State for create and send Testmessages
data = landroidS;


adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

adapter.on('objectChange', function (id, obj) {
    if (!state || state.ack) return;
    // output to parser
});

adapter.on('stateChange', function (id, state) {
    if (state && !state.ack) {
        var command = id.split('.').pop();

        adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

        if (command == "state") {
            if (state.val === true) {
                startMower();
            } else {
                stopMower();
            }
        }
        //Send Testmessage
        else if ((command == "testsend")) {
            landroid.sendMessage(state.val);
        }

        else if ((command == "waitRain")) {
            var val = (isNaN(state.val) || state.val < 1 ? 100 : state.val);
            landroid.sendMessage('{"rd":' + val + '}');
            adapter.log.info("Changed time wait after rain to:" + val);
        }
        else if ((command === "borderCut")||(command === "startTime")||(command === "workTime")) {
            adapter.log.info("test cfgs: ");
            changeMowerCfg(id,state.val);
        }
    }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj == 'object' && obj.message) {
        if (obj.command == 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});
function changeMowerCfg(id, value) {
  var val = value;
  var sval ;
  var message= data.cfg.sc.d; // set aktual values
  var dayID = weekday.indexOf(id.split('.')[3]);
  var valID = ["startTime","workTime","borderCut"].indexOf(id.split('.')[4]);

  try{
    if(valID ===2 ){
      sval = (valID ===2 && val === true) ? 1 : 0;
    }
    else if(valID ===0){
        var h = val.split(':')[0];
        var m = val.split(':')[1];
        adapter.log.info("h: "+ h +" m: "+ m );
        if(h >=0 && h<=23 && m>=0 && m <=59){
            sval = val;
        }
        else adapter.log.error('Time out of range: e.g "10:00"');
    }
    else if(valID ===1 ){
      if(val >=0 && val <= 720){
          sval = val;
      }
      else  adapter.log.error('Time out of range 0 min < time < 720 min.');

    }
    else adapter.log.error('Something went wrong while setting new mower times');
  }
  catch(e){
    adapter.log.error("Error while setting mowers config: "+ e);
  }

  if(sval){
    message[dayID][valID] = sval;
    adapter.log.info("Mow time change to: "+ JSON.stringify(message));
    landroid.sendMessage('{"sc":{"d":'+JSON.stringify(message)+'}}');

  }
  adapter.log.info("test cfg: "+ dayID +" valID: "+ valID +" val: "+ val +" sval: "+ sval);

}


function startMower() {
    if (state === 1 && error == 0) {
        landroid.sendMessage('{"cmd":1}'); //start code for mower
        adapter.log.info("Start Landroid");
    } else {
        adapter.log.warn("Can not start mover because he is not at home or there is an Error please take a look at the mover");
        adapter.setState("mower.state", {
            val: false,
            ack: true
        });
    }
}

function stopMower() {
    if (state === 7 && error == 0) {
        landroid.sendMessage('{"cmd":3}'); //"Back to home" code for mower
        adapter.log.info("Landroid going back home");
    } else {
        adapter.log.warn("Can not stop mover because he did not mow or theres an error");
        adapter.setState("mower.state", {
            val: true,
            ack: true
        });
    }
}

function procedeLandroidS() {
    var Button;
    if (true) {
        adapter.deleteState("landroid-s.0", "mower", "start");
        adapter.deleteState("landroid-s.0", "mower", "stop");

        //delete Teststates
        if (!test) {
            adapter.deleteState("landroid-s.0", "mower", "testsend");
            adapter.deleteState("landroid-s.0", "mower", "testresponse");
        }

        adapter.setObjectNotExists('mower.state', {
            type: 'state',
            common: {
                name: "Start/Stop",
                type: "boolean",
                role: "state",
                read: true,
                write: true,
                desc: "Start and stop the mover",
                smartName: "Rasenmäher"
            },
            native: {}
        });
    }

    adapter.setObjectNotExists('mower.totalTime', {
        type: 'state',
        common: {
            name: "Total mower time",
            type: "number",
            role: "value.interval",
            unit: "h",
            read: true,
            write: false,
            desc: "Total time the mower has been mowing in hours"
        },
        native: {}
    });
    adapter.setObjectNotExists('mower.totalDistance', {
        type: 'state',
        common: {
            name: "Total mower distance",
            type: "number",
            role: "value.interval",
            unit: "km",
            read: true,
            write: false,
            desc: "Total distance the mower has been mowing in hours"
        },
        native: {}
    });
    adapter.setObjectNotExists('mower.totalBladeTime', {
        type: 'state',
        common: {
            name: "Runtime of the blades",
            type: "number",
            role: "value.interval",
            unit: "h",
            read: true,
            write: false,
            desc: "Total distance the mower has been mowing in hours"
        },
        native: {}
    });
    adapter.setObjectNotExists('mower.batteryCharging', {
        type: 'state',
        common: {
            name: "Battery charger state",
            type: "boolean",
            role: 'indicator',
            read: true,
            write: false,
            desc: "Battery charger state",
            default: false
        },
        native: {}
    });
    adapter.setObjectNotExists('mower.batteryVoltage', {
        type: 'state',
        common: {
            name: "Battery voltage",
            type: "number",
            role: "value.interval",
            unit: "V",
            read: true,
            write: false,
            desc: "Voltage of movers battery"
        },
        native: {}
    });
    adapter.setObjectNotExists('mower.batteryTemterature', {
        type: 'state',
        common: {
            name: "Battery temperature",
            type: "number",
            role: "value.interval",
            unit: "°C",
            read: true,
            write: false,
            desc: "Temperature of movers battery"
        },
        native: {}
    });
    adapter.setObjectNotExists('mower.batteryTemterature', {
        type: 'state',
        common: {
            name: "Battery temperature",
            type: "number",
            role: "value.interval",
            unit: "°C",
            read: true,
            write: false,
            desc: "Temperature of movers battery"
        },
        native: {}
    });
    adapter.setObjectNotExists('mower.error', {
        type: 'state',
        common: {
            name: "Error code",
            type: "number",
            read: true,
            write: false,
            desc: "Error code",
            states: {
                0: "No error",
                1: "Trapped",
                2: "Lifted",
                3: "Wire missing",
                4: "Outside wire",
                5: "Raining",
                6: "Close door to mow",
                7: "Close door to go home",
                8: "Blade motor blocked",
                9: "Wheel motor blocked",
                10: "Trapped timeout", // Not sure what this is
                11: "Upside down",
                12: "Battery low",
                13: "Reverse wire",
                14: "Charge error",
                15: "Timeout finding home" // Not sure what this is
            }
        },
        native: {}
    });
    adapter.setObjectNotExists('mower.status', {
        type: 'state',
        common: {
            name: "Landroid status",
            type: "number",
            read: true,
            write: false,
            desc: "Current status of lawn mower",
            states: {
                0: "Idle",
                1: "Home",
                2: "Start sequence",
                3: "Leaving home",
                4: "Follow wire",
                5: "Searching home",
                6: "Searching wire",
                7: "Mowing",
                8: "Lifted",
                9: "Trapped",
                10: "Blade blocked", // Not sure what this is
                11: "Debug",
                12: "Remote control"
            }
        },
        native: {}
    });
    //States for testing
    if (test) {
        adapter.setObjectNotExists('mower.testsend', {
            type: 'state',
            common: {
                name: "Battery temperature",
                type: "sting",
                read: true,
                write: true,
                desc: "testtosend"
            },
            native: {}
        });
        adapter.setObjectNotExists('mower.testresponse', {
            type: 'state',
            common: {
                name: "Battery temperature",
                type: "sting",
                read: true,
                write: true,
                desc: "testtosend"
            },
            native: {}
        });
    }
    firstSet = false;
}


function evaluateCalendar(arr) {
    if (arr) {

        for (var i = 0; i < weekday.length; i++) {
            adapter.setState("calendar." + weekday[i] + ".startTime", { val: arr[i][0], ack: true });
            adapter.setState("calendar." + weekday[i] + ".workTime", { val: arr[i][1], ack: true });
            adapter.setState("calendar." + weekday[i] + ".borderCut", { val: (arr[i][2] && arr[i][2]===1 ? true : false), ack: true });


        }
    }
}

function evaluateResponse() {
    //adapter.setState("lastsync", { val: new Date().toISOString(), ack: true });
    adapter.setState("firmware", { val: data.dat.fw, ack: true });

    evaluateCalendar(data.cfg.sc.d);

    adapter.setState("mower.waitRain", { val: data.cfg.rd, ack: true });
    adapter.setState("mower.batteryState", { val: data.dat.bt.p, ack: true });
    adapter.setState("mower.areasUse", { val: (data.cfg.mz[0] + data.cfg.mz[1] + data.cfg.mz[2] + data.cfg.mz[3]), ack: true });

    setStates();
}

function setStates() {
    //landroid S set states

    adapter.setState("mower.totalTime", { val: (data.dat.st && data.dat.st.wt ? Math.round(data.dat.st.wt / 6) / 10 : null), ack: true });
    adapter.setState("mower.totalDistance", { val: (data.dat.st && data.dat.st.d ? Math.round(data.dat.st.d / 100) / 10 : null), ack: true });
    adapter.setState("mower.totalBladeTime", { val: (data.dat.st && data.dat.st.b ? Math.round(data.dat.st.b / 6) / 10 : null), ack: true });
    adapter.setState("mower.batteryCharging", { val: (data.dat.bt && data.dat.bt.c ? true : false), ack: true });
    adapter.setState("mower.batteryVoltage", { val: (data.dat.bt && data.dat.bt.v ? data.dat.bt.v : null), ack: true });
    adapter.setState("mower.batteryTemterature", { val: (data.dat.bt && data.dat.bt.t ? data.dat.bt.t : null), ack: true });
    adapter.setState("mower.error", { val: (data.dat && data.dat.le ? data.dat.le : 0), ack: true });
    adapter.setState("mower.status", { val: (data.dat && data.dat.ls ? data.dat.ls : 0), ack: true });

    state = (data.dat && data.dat.ls ? data.dat.ls : 0);
    error = (data.dat && data.dat.le ? data.dat.le : 0);

    if ((state === 7 || state=== 9 ) && error === 0) {
        adapter.setState("mower.state", { val: true, ack: true });
    } else {
        adapter.setState("mower.state", { val: false, ack: true });
    }
}


// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

//Autoupdate Push
var updateListener = function (status) {
    if (status) { // We got some data from the Landroid
        data = status; // Set new Data to var data
        adapter.setState("mower.testresponse", { val: JSON.stringify(status), ack: true });
        evaluateResponse();
    } else {
        adapter.log.error("Error getting update!");
    }
};

function checkStatus() {
    landroid.sendMessage('{}');
}

function main() {
    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    if(adapter.config.mac !== "XX:XX:XX:XX:XX:XX" && adapter.config.pwd !== "PASSWORT"){
      landroid = new LandroidCloud(adapter);
    }
    else{
      adapter.log.error("Bitte email, Passwort und Mac ausfüllen");
    }


    if (firstSet) procedeLandroidS();

    var secs = adapter.config.poll;
    if (isNaN(secs) || secs < 1) {
        secs = 60;
    }

    adapter.log.debug('mail adress: ' + adapter.config.email);
    adapter.log.debug('password were set to: ' + adapter.config.pwd);
    adapter.log.debug('MAC adress set to: ' + adapter.config.mac);

    landroid.init(updateListener);
    evaluateResponse();

    adapter.subscribeStates('*');
    //checkStatus();
    setInterval(checkStatus, secs * 1000);
}
