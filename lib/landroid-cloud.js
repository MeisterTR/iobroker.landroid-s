/*
  This module handles the communication with the Worx Landroid 2017 models cloud service
 */

 //Modul from https://github.com/mjiderhamn/worx-landroid-nodejs/blob/master/landroid-cloud.js

const assert = require('assert');
const awsIot = require('aws-iot-device-sdk');
const najax = require('najax'); // https://github.com/najaxjs/najax
const http = require('http');
const https = require('https');
const pem = require("pem"); // https://github.com/Dexus/pem
const uuidv1 = require('uuid/v1');
//var utils =    require(__dirname + 'utils');
//var adapter = utils.adapter('landroid-s');


var os = require('os');
var path = require('path');
// var request = require('request'); // https://github.com/request/request

if (process.platform === 'win32') {
    // use custom config, otherwise fallbacks to /usr/local/ssl/openssl.cnf
    process.env.OPENSSL_CONF = path.join('C:', 'OpenSSL-Win32', 'bin', 'openssl.cfg');
    // use bundled openssl executable
    pem.config({
        pathOpenSSL: path.join('C:', 'OpenSSL-Win32', 'bin', 'openssl.exe')
    });
}



const STATUS_CODE_HOME = 1;
const STATUS_MESSAGES = [];
STATUS_MESSAGES[0] = "Idle";
STATUS_MESSAGES[STATUS_CODE_HOME] = "Home"; // Combine with charge code and error code TODO Charge code
STATUS_MESSAGES[2] = "Start sequence";
STATUS_MESSAGES[3] = "Leaving home";
STATUS_MESSAGES[4] = "Follow wire";
STATUS_MESSAGES[5] = "Searching home";
STATUS_MESSAGES[6] = "Searching wire";
STATUS_MESSAGES[7] = "Mowing";
STATUS_MESSAGES[8] = "Lifted";
STATUS_MESSAGES[9] = "Trapped";
STATUS_MESSAGES[10] = "Blade blocked";
STATUS_MESSAGES[11] = "Debug";
STATUS_MESSAGES[12] = "Remote control";

const ERROR_CODE_RAINING = 5;
const ERROR_MESSAGE = [];
ERROR_MESSAGE[0] = null;
ERROR_MESSAGE[1] = "Trapped";
ERROR_MESSAGE[2] = "Lifted";
ERROR_MESSAGE[3] = "Wire missing";
ERROR_MESSAGE[4] = "Outside wire";
ERROR_MESSAGE[ERROR_CODE_RAINING] = "Raining";
ERROR_MESSAGE[6] = "Close door to mow";
ERROR_MESSAGE[7] = "Close door to go home";
ERROR_MESSAGE[8] = "Blade motor blocked";
ERROR_MESSAGE[9] = "Wheel motor blocked";
ERROR_MESSAGE[10] = "Trapped timeout"; // Not sure what this is
ERROR_MESSAGE[11] = "Upside down";
ERROR_MESSAGE[12] = "Battery low";
ERROR_MESSAGE[13] = "Reverse wire";
ERROR_MESSAGE[14] = "Charge error";
ERROR_MESSAGE[15] = "Timeout finding home";  // Not sure what this is


function LandroidCloud(adapter) {
  this.adapter= adapter;
  this.email = adapter.config.email;
  this.password = adapter.config.pwd;
  this.macAddress = adapter.config.mac ?
    adapter.config.mac.toUpperCase().replace(/\:/g, '') : null;

  this.uuid = uuidv1();
  this.device;
  //this.adapter.log.info("UUID: " + this.uuid);
}

LandroidCloud.prototype.setToken = function (token) {
  this.token = token;
  this.adapter.log.info("API token set to " + this.token);
};

/** Perform all initialization needed for connecting to the MQTT topic */
LandroidCloud.prototype.init = function (updateListener) {
  this.updateListener = updateListener;
  this.retrieveGuestToken();
};

/** Retrieve hard coded guest token from Pastebin */
LandroidCloud.prototype.retrieveGuestToken = function () {
  var self = this;

  getUrlBody('https://pastebin.com/raw/JMmVCUrf', function (body) {
    self.adapter.log.info("Downloaded guest token");
    self.setToken(body);

    self.retrieveUserToken();
  });
};

/** Log in user to retrieve user token */
LandroidCloud.prototype.retrieveUserToken = function () {
  var self = this;

  self.callApi('POST', "users/auth", {
        email: self.email,
        password: self.password,
        uuid: self.uuid,
        // We'll pretend we're the Android app
        type: 'app',
        platform: 'android'
      }, function (data) {
        if(data.api_token) {
          self.adapter.log.info("Logged in as " + self.email + " - user token retrieved from API");
          self.setToken(data.api_token);

          self.retrieveCertificate();
        }
        else {
          throw new Error("Unexpected response: " + JSON.stringify(data));
        }

      });
};

/** Get certificate to use for MQTT */
LandroidCloud.prototype.retrieveCertificate = function () {
  if(! this.token)
    throw new Error("Token must be retrieved/set first");

  var self = this;
  this.callApi("GET", "users/certificate", null, function (data) {
    if(data.pkcs12) {
      self.adapter.log.info("Certificate retrieved");
      //  Buffer for all nodes versions
      if (typeof Buffer.from === "function") { // Node 6+
        try{
            self.setCertificate(Buffer.from(data.pkcs12, 'base64'));
        }
        catch(e){
            self.adapter.log.warn("Warning Buffer, try new Buffer");
            self.setCertificate(new Buffer(data.pkcs12, 'base64'));
        }

      }else {
        self.setCertificate(new Buffer(data.pkcs12, 'base64'));
      }
      //self.adapter.log.info('Connected to MQTT broker - subscribing tosdsd ' + setCertificate);
    }
    else {
      throw new Error("Unexpected response: " + JSON.stringify(data));
    }

  });
};

/** Load certificate and private key from file or buffer */
LandroidCloud.prototype.setCertificate = function (pkcs12, updateListener) {
  if(updateListener) {
    this.updateListener = updateListener;
  }

  var self = this;

  pem.readPkcs12(pkcs12, { }, function(err, cert, ca) {
    if(err !== null) {
      this.adapter.log.info("Unable to convert certificate. Make sure OpenSSL is either on your path, or executable is pointed out" +
          "by OPENSSL_BIN environment variable. " + err);
      throw new Error(err);
    }
    self.cert = cert.cert;
    self.key = cert.key;
    //self.adapter.log.info('Connected to MQTT broker - subscribing tosdsd ' + cert.key);
    self.connectToMQTT();
  });
};

/** Connect to MQTT broker and subscribe to topic */
LandroidCloud.prototype.connectToMQTT = function () {
  assert(this.cert, "Certificate must be set before connecting to MQTT");
  assert(this.key, "Private key must be set before connecting to MQTT");
  assert(this.macAddress, "MAC address must be set before connecting to MQTT");

  var self = this;

  // See https://github.com/aws/aws-iot-device-sdk-js
  this.adapter.log.info("Fetching root CA");
  getUrlBody("https://www.symantec.com/content/en/us/enterprise/verisign/roots/VeriSign-Class%203-Public-Primary-Certification-Authority-G5.pem",
      function (ca) {
        //  Buffer for all nodes versions
        if (typeof Buffer.from === "function") {
          try {
            var certB  =     Buffer.from(self.cert);
            var keyB   =     Buffer.from(self.key);
            var caB    =     Buffer.from(ca);
          } catch (e) {
            var certB  =     new Buffer(self.cert);
            var keyB   =     new Buffer(self.key);
            var caB    =     new Buffer(ca);
          }

        }else {
           var certB  =     new Buffer(self.cert);
           var keyB   =     new Buffer(self.key);
           var caB    =     new Buffer(ca);
        }

        self.adapter.log.info("Connecting to MQTT broker");

        self.device = awsIot.device({
          host: 'a1optpg91s0ydf.iot.eu-west-1.amazonaws.com',
          clientCert: certB,
          privateKey: keyB,
          // passphrase: "",
          caCert: caB, // TODO Cache in object
          clientId: self.uuid,
          region: 'eu-west-1'
        });

      self.device.on('message', function(topic, payload) {
          if(Buffer.isBuffer(payload)) {
            payload = payload.toString('utf8');
            //self.adapter.log.info('Message??? ' + payload);
          }

          if(typeof payload === 'string' || payload instanceof String) {
            payload = JSON.parse(payload);
          }

          self.onMessage(payload);
        });

        self.device.on('connect', function() {
          var topic = 'DB510/' + self.macAddress+ '/commandOut';
          var topicIn = 'DB510/' + self.macAddress + '/commandIn';
          self.adapter.log.info('Connected to MQTT broker - subscribing to ' + topic);
          self.device.subscribe(topic);
          //var sends = '{"cfg":{"sc":{d":[["16:00",30,1],["04:30",210,1],["05:00",240,1],["00:00",0,1],["04:00",300,1],["19:45",254,1],["19:00",298,1]]}}}';
          //device.publish(topicIn,sends);
        });

        function sendMessag(){

        };
  });
};
LandroidCloud.prototype.sendMessage = function (message) {
  var topicIn = 'DB510/' + this.macAddress + '/commandIn';
  this.adapter.log.debug('Sending Message: ' + message);
  //var sends = '{"cmd":3}';
  this.device.publish(topicIn,message);
};

/** New MQTT message received */
LandroidCloud.prototype.onMessage = function (payload) {
  var data = payload.dat;
  if(data) {
    // this.adapter.log.info('MQTT message received: ' + JSON.stringify(data));

    status = {
      state: null,
      errorMessage: null,

      batteryPercentage: null,
      totalMowingHours: null,
      noOfAlarms: null
    };

    if(data.ls && data.ls === STATUS_CODE_HOME && data.le && data.le === ERROR_CODE_RAINING) { // Special case
      status.state = "Rain delay";
      status.errorMessage = null;
    }
    else { // Normal case
      status.state = (data.ls && data.ls >= 0 && data.ls < STATUS_MESSAGES.length) ?
          STATUS_MESSAGES[data.ls] : "Unknown";
      status.errorMessage = (data.le && data.le < ERROR_MESSAGE.length) ?
          (data.le > 0 ? ERROR_MESSAGE[data.le] : null) :
          "Unknown error";
      status.noOfAlarms = status.errorMessage ? 1 : 0;
    }
    // status.batteryPercentage = (data.bt && data.bt.c) ? data.bt.c : 0; // Does not seem to work
    status.totalMowingHours = data.st && data.st.wt ?
        Math.round(data.st.wt/6) / 10 : // Minutes
        null;

    this.adapter.log.debug("Landroid status: " + JSON.stringify(status));

    if(this.updateListener) {
      this.updateListener(payload);
    }
  }
  else
    this.adapter.log.warn("No 'dat' in message payload! " + JSON.stringify(payload));
};

/** Call API at https://api.worxlandroid.com/api/v1/ */
LandroidCloud.prototype.callApi = function (method, path, data, onSuccess) {
  var self = this;
  najax({
    url: "https://api.worxlandroid.com/api/v1/" + path,
    // method: 'POST',
    type: method,
    data: data,
    headers: {
      'X-Auth-Token': self.token
    },
    dataType: "json",
    success: function(data, statusText, jqXHR) {

      if(jqXHR.status === 200) {
        onSuccess(data);
      }
      else if(data.message && data.code) { // Error message
        // this.adapter.log.info("response: " + JSON.stringify(data));
        throw new Error(data.message);
      }
      else {
        throw new Error("Unexpected response: " + JSON.stringify(data));
      }
    },
    error: function (e) {
      this.adapter.log.error("Error calling API! " + JSON.stringify(e));
      throw e;
    }
  });
};


///////////////////////////////////////////////////////////////////////////////////////////////////////////
// Utility functions

/** Get body of the contents at the provided url */
function getUrlBody(url, callback) {
  /*
   request.get(url, function (error, response, body) {
     if (!error && response.statusCode == 200) {
      callback(body);
     }
   });
   */

  var ssl = url.indexOf("https://") === 0;

  (ssl ? https : http).get(url).on('response', function (response) {
    var body = '';
    response.on('data', function (chunk) {
      body += chunk;
    });
    response.on('end', function () {
      // guestToken = body;
      // if(callback)
      callback(body);
    });
  });

  /*
   var client = http.createClient(443, url);
   var request = client.request();
   request.on('response', function( res ) {
     res.on('data', function( data ) {
     this.adapter.log.info( data );
     guestToken = data.toString();
   } );
   request.end();
   */
}

module.exports = LandroidCloud;
