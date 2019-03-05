/* jshint -W097 */ // jshint strict:false
/*jslint node: true */
"use strict";

// main version 2.5.0 (09.08.2018)
//-------------------------------------------------------

var utils = require(__dirname + '/lib/utils'); // Get common adapter utils
var adapter = utils.Adapter('landroid-s');
var mqttCloud = require(__dirname + '/lib/mqttCloud');
var ip, pin, data, getOptions, error, state;
var mower;

var connected = false;
var pingTimeout = null;
var firstSet = true;
var weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
var test = false; // State for create and send Testmessages
var areas = [];


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
        else if ((command == "rawSend")) {
            mower.sendMessage(state.val);
        }

        else if ((command == "waitRain")) {
            var val = (isNaN(state.val) || state.val < 0 ? 100 : parseInt(state.val));
            mower.sendMessage('{"rd":' + val + '}');
            adapter.log.info("Changed time wait after rain to:" + val);
        }
        else if ((command === "borderCut") || (command === "startTime") || (command === "workTime")) {
            changeMowerCfg(id, state.val);
        }
        else if ((command === "area_1") || (command === "area_2") || (command === "area_3") || (command === "area_4")) {
            changeMowerArea(id, parseInt(state.val));
        }
        else if (command === "startSequence") {
            startSequences(id, state.val);
        }
        else if (command === "pause") {
            sendPause(id, state.val);
        }
        else if (command === "mowTimeExtend") {
            mowTimeEx(id, parseInt(state.val));
        }
        else if (command === "mowerActive") {
            var val = (state.val ? 1 : 0);
            var message = data.cfg.sc;
            message.m = val;
            mower.sendMessage('{"sc":' + JSON.stringify(message) + '}');
            adapter.log.info("Mow times disabled: " + message.m);
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
    var sval;
    var message = data.cfg.sc.d; // set aktual values
    var dayID = weekday.indexOf(id.split('.')[3]);
    var valID = ["startTime", "workTime", "borderCut"].indexOf(id.split('.')[4]);

    try {
        if (valID === 2) { // changed the border cut
            sval = (valID === 2 && val === true) ? 1 : 0;
        }
        else if (valID === 0) { // changed the start time
            var h = val.split(':')[0];
            var m = val.split(':')[1];
            adapter.log.info("h: " + h + " m: " + m);
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                sval = val;
            }
            else adapter.log.error('Time out of range: e.g "10:00"');
        }
        else if (valID === 1) { // changed the worktime
            if (val >= 0 && val <= 720) {
                sval = parseInt(val);
            }
            else adapter.log.error('Time out of range 0 min < time < 720 min.');

        }
        else adapter.log.error('Something went wrong while setting new mower times');
    }
    catch (e) {
        adapter.log.error("Error while setting mowers config: " + e);
    }

    if (sval !== undefined) {
        message[dayID][valID] = sval;
        adapter.log.debug("Mow time change to: " + JSON.stringify(message));
        mower.sendMessage('{"sc":{"d":' + JSON.stringify(message) + '}}');

    }
    adapter.log.debug("test cfg: " + dayID + " valID: " + valID + " val: " + val + " sval: " + sval);

}
function mowTimeEx(id, value) {
    var val = value;
    var message = data.cfg.sc; // set aktual values
    if (!isNaN(val) && val >= -100 && val <= 100) {
        message.p = val;
        mower.sendMessage('{"sc":' + JSON.stringify(message) + '}');
        adapter.log.info("MowerTimeExtend set to : " + message.p);

    } else {
        adapter.log.error("MowerTimeExtend must be a value between -100 and 100");
    }
}

function changeMowerArea(id, value) {
    var val = value;
    var message = data.cfg.mz; // set aktual values
    var areaID = (id.split('_').pop()) - 1;

    try {
        if (!isNaN(val) && val >= 0 && val <= 500) {
            message[areaID] = val;
            mower.sendMessage('{"mz":' + JSON.stringify(message) + '}');
            adapter.log.info("Change Area " + (areaID + 1) + " : " + JSON.stringify(message));
        }
        else {
            adapter.log.error("Area Value ist not correct, please type in a val between 0 and 500");
            adapter.setState("areas.area_" + (areaID + 1), { val: (data.cfg.mz && data.cfg.mz[areaID] ? data.cfg.mz[areaID] : 0), ack: true });
        }
    }
    catch (e) {
        adapter.log.error("Error while setting mowers areas: " + e);
    }
}
function sendPause(id, value) {
    if (value === true) {
        mower.sendMessage('{"cmd":2}');
    }
}

function startSequences(id, value) {
    var val = value;
    var message = data.cfg.mz; // set aktual values
    var seq = [];
    try {
        seq = JSON.parse("[" + val + "]");

        for (var i = 0; i < 10; i++) {
            if (seq[i] != undefined) {
                if (isNaN(seq[i]) || seq[i] < 0 || seq[i] > 3) {
                    seq[i] = 0;
                    adapter.log.error("Wrong start sequence, set val " + i + " to 0");
                }

            } else {
                seq[i] = 0;
                adapter.log.warn("Array ist too short, filling up with start point 0");
            }
        }
        mower.sendMessage('{"mzv":' + JSON.stringify(seq) + '}');
        adapter.log.info("new Array is: " + JSON.stringify(seq));

    }
    catch (e) {
        adapter.log.error("Error while setting start seqence: " + e);
    }
}

function startMower() {
    if ((state === 1 || state === 34)&& error == 0) {
        mower.sendMessage('{"cmd":1}'); //start code for mower
        adapter.log.info("Start mower");
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
        mower.sendMessage('{"cmd":3}'); //"Back to home" code for mower
        adapter.log.info("mower going back home");
    } else {
        adapter.log.warn("Can not stop mover because he did not mow or theres an error");
        adapter.setState("mower.state", {
            val: true,
            ack: true
        });
    }
}

function procedeMower() {
    var Button = adapter.config.enableJson;
    if (true) {

        //delete Teststates
        if (!Button) {
            adapter.deleteState(adapter.namespace, "mower", "rawSend");
            adapter.deleteState(adapter.namespace, "mower", "rawResponse");
        }
        //adapter.createChannel(adapter.namespace, "areas", {
        //  name: "mower areas"
        //});


        adapter.setObjectNotExists('mower.state', {
            type: 'state',
            common: {
                name: "Start/Stop",
                type: "boolean",
                role: "switch.power",
                read: true,
                write: true,
                desc: "Start and stop the mover",
                smartName: "Rasenmäher"
            },
            native: {}
        });
    }
    adapter.setObjectNotExists('mower.pause', {
        type: 'state',
        common: {
            name: "Pause",
            type: "boolean",
            role: "button.stop",
            read: true,
            write: true,
            desc: "Pause the mover",
        },
        native: {}
    });

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
            role: "value.distance",
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
    adapter.setObjectNotExists('mower.batteryChargeCycle', {
        type: 'state',
        common: {
            name: "Battery charge cycle",
            type: "number",
            role: 'value',
            read: true,
            write: false,
            desc: "Show the number of charging cycles"
        },
        native: {}
    });
    adapter.setObjectNotExists('mower.batteryVoltage', {
        type: 'state',
        common: {
            name: "Battery voltage",
            type: "number",
            role: "value",
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
            role: "value.temperature",
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
            role: "value",
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
            name: "mower status",
            type: "number",
            role: "value",
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
                12: "Remote control",
                30: "Going home",
                32: "Border Cut",
                33: "Searching zone",
                34: "Pause"
            }
        },
        native: {}
    });

    // Values for areas

    adapter.setObjectNotExists('areas.startSequence', {
        type: 'state',
        common: {
            name: "Start sequence",
            type: "sting",
            role: "json",
            read: true,
            write: true,
            desc: "Sequence of area to start from"
        },
        native: {}
    });
    adapter.setObjectNotExists('areas.area_1', {
        type: 'state',
        common: {
            name: "Area 1",
            type: "number",
            role: "value",
            unit: "m",
            read: true,
            write: true,
            desc: "Distance from Start point for area 1"
        },
        native: {}
    });
    adapter.setObjectNotExists('areas.actualArea', {
        type: 'state',
        common: {
            name: "Actual area",
            type: "number",
            role: "value",
            read: true,
            write: false,
            desc: "Show the current area"
        },
        native: {}
    });
    adapter.setObjectNotExists('areas.actualAreaIndicator', {
        type: 'state',
        common: {
            name: "Actual area",
            type: "number",
            role: "value",
            read: true,
            write: false,
            desc: "Show the current area"
        },
        native: {}
    });

    adapter.setObjectNotExists('areas.area_2', {
        type: 'state',
        common: {
            name: "Area 2",
            type: "number",
            role: "value",
            unit: "m",
            read: true,
            write: true,
            desc: "Distance from Start point for area 2"
        },
        native: {}
    });
    adapter.setObjectNotExists('areas.area_3', {
        type: 'state',
        common: {
            name: "Area 3",
            type: "number",
            role: "value",
            unit: "m",
            read: true,
            write: true,
            desc: "Distance from Start point for area 3"
        },
        native: {}
    });
    adapter.setObjectNotExists('areas.area_4', {
        type: 'state',
        common: {
            name: "Area 4",
            type: "number",
            role: "value",
            unit: "m",
            read: true,
            write: true,
            desc: "Distance from Start point for area 4"
        },
        native: {}
    });
    adapter.setObjectNotExists('info.wifiQuality', {
        type: 'state',
        common: {
            name: "Wifi quality",
            type: "number",
            read: true,
            role: "value",
            unit: "dBm",
            desc: "Prozent of Wifi quality"
        },
        native: {}
    });
    adapter.setObjectNotExists('calendar.mowerActive', {
        type: 'state',
        common: {
            name: "Time-controlled mowing",
            type: "boolean",
            read: true,
            desc: "Time-controlled mowing"
        },
        native: {}
    });
    adapter.setObjectNotExists('calendar.mowTimeExtend', {
        type: 'state',
        common: {
            name: "Mowing times exceed",
            type: "number",
            role: "level",
            read: true,
            write: true,
            unit: "%",
            desc: "Extend the mowing time"
        },
        native: {}
    });

    //States for testing
    if (Button) {
        adapter.setObjectNotExists('mower.rawSend', {
            type: 'state',
            common: {
                name: "raw send",
                type: "sting",
                role: "json",
                read: true,
                write: true,
                desc: "object for sending raw messages to the mower"
            },
            native: {}
        });
        adapter.setObjectNotExists('mower.rawResponse', {
            type: 'state',
            common: {
                name: "raw response",
                type: "sting",
                role: "json",
                read: true,
                write: false,
                desc: "Display the raw message from the mower"
            },
            native: {}
        });
    }


    if (adapter.config.houerKm) {

        changeUnit(["m", "min", "min"]);
    } else {
        changeUnit(["km", "h", "h"]);
    }

    firstSet = false;
}

function changeUnit(unitset) {
    var array = ['.mower.totalDistance', '.mower.totalBladeTime', '.mower.totalTime'];
    for (var i = 0; i < array.length; i++) {
        adapter.extendObject(adapter.namespace + array[i], { common: { unit: unitset[i] } });
    }
}


function evaluateCalendar(arr) {
    if (arr) {

        for (var i = 0; i < weekday.length; i++) {
            adapter.setState("calendar." + weekday[i] + ".startTime", { val: arr[i][0], ack: true });
            adapter.setState("calendar." + weekday[i] + ".workTime", { val: arr[i][1], ack: true });
            adapter.setState("calendar." + weekday[i] + ".borderCut", { val: (arr[i][2] && arr[i][2] === 1 ? true : false), ack: true });


        }
    }
}

function evaluateResponse() {
    //adapter.setState("lastsync", { val: new Date().toISOString(), ack: true });
    adapter.setState("info.firmware", { val: data.dat.fw, ack: true });

    evaluateCalendar(data.cfg.sc.d);

    adapter.setState("mower.waitRain", { val: data.cfg.rd, ack: true });
    adapter.setState("mower.batteryState", { val: data.dat.bt.p, ack: true });


    setStates();
}

function setStates() {
    //mower S set states
    var sequence = [];

    if (adapter.config.houerKm) {
        adapter.setState("mower.totalTime", { val: (data.dat.st && data.dat.st.wt ? data.dat.st.wt : null), ack: true });
        adapter.setState("mower.totalDistance", { val: (data.dat.st && data.dat.st.d ? data.dat.st.d : null), ack: true });
        adapter.setState("mower.totalBladeTime", { val: (data.dat.st && data.dat.st.b ? data.dat.st.b : null), ack: true });
    }
    else {
        adapter.setState("mower.totalTime", { val: (data.dat.st && data.dat.st.wt ? Math.round(data.dat.st.wt / 6) / 10 : null), ack: true });
        adapter.setState("mower.totalDistance", { val: (data.dat.st && data.dat.st.d ? Math.round(data.dat.st.d / 100) / 10 : null), ack: true });
        adapter.setState("mower.totalBladeTime", { val: (data.dat.st && data.dat.st.b ? Math.round(data.dat.st.b / 6) / 10 : null), ack: true });
    }


    adapter.setState("mower.batteryChargeCycle", { val: (data.dat.bt && data.dat.bt.nr ? data.dat.bt.nr : null), ack: true });
    adapter.setState("mower.batteryCharging", { val: (data.dat.bt && data.dat.bt.c ? true : false), ack: true });
    adapter.setState("mower.batteryVoltage", { val: (data.dat.bt && data.dat.bt.v ? data.dat.bt.v : null), ack: true });
    adapter.setState("mower.batteryTemterature", { val: (data.dat.bt && data.dat.bt.t ? data.dat.bt.t : null), ack: true });
    adapter.setState("mower.error", { val: (data.dat && data.dat.le ? data.dat.le : 0), ack: true });
    adapter.setState("mower.status", { val: (data.dat && data.dat.ls ? data.dat.ls : 0), ack: true });
    adapter.setState("info.wifiQuality", { val: (data.dat && data.dat.rsi ? data.dat.rsi : 0), ack: true });


    adapter.setState("calendar.mowerActive", { val: (data.cfg.sc && data.cfg.sc.m ? true : false), ack: true });
    adapter.setState("calendar.mowTimeExtend", { val: (data.cfg.sc && data.cfg.sc.p ? data.cfg.sc.p : 0), ack: true });

    // sort Areas
    adapter.setState("areas.area_1", { val: (data.cfg.mz && data.cfg.mz[0] ? data.cfg.mz[0] : 0), ack: true });
    adapter.setState("areas.area_2", { val: (data.cfg.mz && data.cfg.mz[1] ? data.cfg.mz[1] : 0), ack: true });
    adapter.setState("areas.area_3", { val: (data.cfg.mz && data.cfg.mz[2] ? data.cfg.mz[2] : 0), ack: true });
    adapter.setState("areas.area_4", { val: (data.cfg.mz && data.cfg.mz[3] ? data.cfg.mz[3] : 0), ack: true });

    adapter.setState("areas.actualArea", { val: (data.dat ? data.cfg.mzv[data.dat.lz] : null), ack: true });
    adapter.setState("areas.actualAreaIndicator", { val: (data.dat && data.dat.lz ? data.dat.lz : null), ack: true });

    areas = data.cfg.mz;

    for (var i = 0; i < data.cfg.mzv.length; i++) {
        //  adapter.setState("areas.startSequence", { val: data.cfg.mzv[i], ack: true });
        sequence.push(data.cfg.mzv[i]);
    }
    adapter.setState("areas.startSequence", { val: (sequence), ack: true });

    state = (data.dat && data.dat.ls ? data.dat.ls : 0);
    error = (data.dat && data.dat.le ? data.dat.le : 0);

    if ((state === 7 || state === 9) && error === 0) {
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
    if (status) { // We got some data from the Mower
        clearTimeout(pingTimeout);
        pingTimeout = null;
        if (!connected) {
            connected = true;
            adapter.log.info('Connected to mower');
            adapter.setState('info.connection', true, true);
        }
        data = status; // Set new Data to var data
        adapter.setState("mower.rawResponse", { val: JSON.stringify(status), ack: true });
        evaluateResponse();
    } else {
        adapter.log.error("Error getting update!");
    }
};

function checkStatus() {
    pingTimeout = setTimeout(function () {
        pingTimeout = null;
        if (connected) {
            connected = false;
            adapter.log.info('Disconnect from mower');
            adapter.setState('info.connection', false, true);
        }
    }, 3000);
    mower.sendMessage('{}');
}

function main() {


    mower = new mqttCloud(adapter);

    if (adapter.config.pwd === "PASSWORT") {

        adapter.log.error("Bitte die Felder E-Mail und Passwort ausfüllen!");
        adapter.setState('info.connection', false, true);
    }
    else {




        if (firstSet) procedeMower();


        adapter.log.debug('Mail address: ' + adapter.config.email);
        adapter.log.debug('Password were set to: ' + adapter.config.pwd);

        mower.init(updateListener);
        adapter.subscribeStates('*');
    }

}
