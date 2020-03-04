// mqttCloud connect
// this file connect to different apis and opend an mqtt connection to mower and get the data from the mower
//____________________________________________________________________
//Version: 1.0.3 (08.04.2019)
//
//*1.0.3 Hotfix because worx changed api from v1 to v2 (quick and durty)

const http = require('http');
const https = require('https');
const uuidv1 = require('uuid/v1');
const mqtt = require('mqtt');

const devCon = require(__dirname + '/worxConfig');

let ident = salt => {
    let tTC = text => text.split('').map(c => c.charCodeAt(0))
    let saltChars = tTC(salt)
    let aSTC = code => tTC(salt).reduce((a, b) => a ^ b, code)
    return encoded => encoded.match(/.{1,2}/g).map(hex => parseInt(hex, 16)).map(aSTC).map(charCode => String.fromCharCode(charCode)).join('')
}

function mqttCloud(adapter) {
    this.adapter = adapter;
    this.email = adapter.config.email;
    this.password = adapter.config.pwd;
    this.mower_sel = adapter.config.dev_sel;
    this.uuid = uuidv1();
    this.device;
    //this.adapter.log.debug("UUID: " + this.uuid);
};

/** Perform all initialization needed for connecting to the MQTT topic */
mqttCloud.prototype.init = function (updateListener) {
    this.updateListener = updateListener;
    this.token = ident(devCon.apiUrl)(devCon.token);
    this.retrieveUserToken();
};

/** Login and retrieve user token */
mqttCloud.prototype.retrieveUserToken = function () {
    var self = this;
    var post = devCon.postJson;

    post[devCon.translate.username] = self.email;
    post[devCon.translate.password] = self.password;
    post.client_secret = ident(devCon.apiUrl)(devCon.token);
    if (typeof post.uuid !== "undefined") post.uuid = self.uuid;

    var postString = JSON.stringify(post);

    self.adapter.log.debug("post:" + postString);
    this.api('POST', devCon.userTokenPath, postString, function (data) {
        //	{"message":"Wrong credentials","code":"401.003"}
        self.adapter.log.debug("post to " + devCon.userTokenPath + ": " + JSON.stringify(data));

        if (data.message === "Wrong credentials" || data.message === "The user credentials were incorrect.") {
            self.adapter.log.error("wrong email or password!");
            self.adapter.setState('info.connection', false, true);
        } else {
            self.token = data[devCon.translate.access_token];
            self.type = data.token_type;
            self.retrieveUserProfile();

        }
    });
};

/** Retrieve User profile */
mqttCloud.prototype.retrieveUserProfile = function () {
    var self = this
    this.api('GET', "users/me", null, function (data) {
        self.adapter.log.debug("users/me: " + JSON.stringify(data))
        self.mqtt_endpoint = data.mqtt_endpoint
        self.adapter.log.debug("Mqtt url: " + self.mqtt_endpoint)
        self.retrieveAwsCert()
    })
}


/** Retrieve AWS certificate */
mqttCloud.prototype.retrieveAwsCert = function (updateListener) {

    //is this ok?
    if (updateListener) {
        this.updateListener = updateListener;
    }
    var self = this;

    this.api('GET', "users/certificate", null, function (data) {

        if (typeof Buffer.from === "function") { // Node 6+
            try {
                self.p12 = Buffer.from(data.pkcs12, 'base64');
            } catch (e) {
                self.adapter.log.warn("Warning Buffer function  is empty, try new Buffer");
                self.p12 = new Buffer(data.pkcs12, 'base64');
            }

        } else {
            self.p12 = new Buffer(data.pkcs12, 'base64');
        }
        //TODO Konsole
        self.adapter.log.debug("AWS certificate done");

        self.api('GET', "product-items", null, function (data) {
            self.adapter.log.debug("product-items " + JSON.stringify(data));

            if (data[self.mower_sel]) {
                self.adapter.log.info("mower " + self.mower_sel + " selected");
                self.macAddress = data[self.mower_sel].mac_address;
                self.product_id = data[self.mower_sel].product_id;
                self.mqtt_command_in = data[self.mower_sel].mqtt_topics.command_in;
                self.mqtt_command_out = data[self.mower_sel].mqtt_topics.command_out;

                self.adapter.log.debug("Mac adress set to: " + data[self.mower_sel].mac_address);
            } else {
                self.adapter.log.debug("mower not found, fallback to first mower");
                self.macAddress = data[0].mac_address;
                self.product_id = data[0].product_id;
                self.adapter.log.debug("Mac adress set to: " + data[0].mac_address);

            }
            self.connectMqtt();
        });
    });
};

/** Connect Mqtt broker and ... */
mqttCloud.prototype.connectMqtt = function () {
    var self = this;

    var options = {
        pfx: this.p12,
        clientId: "android-" + self.uuid //this.mqtt_client_id
    };

    self.device = mqtt.connect("mqtts://" + self.mqtt_endpoint, options);

    self.device.on('offline', function () {
        self.adapter.log.debug('Worxcloud MQTT offline');
    });

    self.device.on('disconnect', function (packet) {
        self.adapter.log.debug('Worxcloud MQTT disconnect' + packet);
    });

    self.device.on('connect', function () {
        self.device.subscribe(self.mqtt_command_out);
        self.adapter.log.debug("Mqtt connected!");
        self.device.publish(self.mqtt_command_in, "{}");
    });

    self.device.on('message', function (topic, message) {

        //self.adapter.log.info(message.toString());
        self.onMessage(JSON.parse(message));
    });

    self.device.on('error', function () {
        this.adapter.log.error("Mqtt error");
    });

    self.device.on('packetreceive', function (packet) { // subscribed or received
    });
};


mqttCloud.prototype.sendMessage = function (message) {
    var topicIn = this.mqtt_topic_prefix + "/" + this.macAddress + '/commandIn';
    this.adapter.log.debug('Sending Message: ' + message);
    //var sends = '{"cmd":3}';
    this.device.publish(topicIn, message);
};

/** New MQTT message received */
mqttCloud.prototype.onMessage = function (payload) {
    var data = payload.dat;
    if (data) {
        this.adapter.log.debug("Landroid status: " + JSON.stringify(payload));

        if (this.updateListener) {
            this.updateListener(payload);
        }
    } else
        this.adapter.log.warn("No 'dat' in message payload! " + JSON.stringify(payload));
};

/** Simple get request to url **/
mqttCloud.prototype.get = function (url, cb) {
    var req = https.get(url).on('response', function (res) {
        var body = "";

        console.log("get " + ' ' + url + " -> ", res.statusCode);
        res.on('data', function (d) {
            body += d
        });
        res.on('end', function () {
            cb(body)
        });
    });
    req.on('error', function (e) {
        console.error("get error " + e)
    });
};

/** Worx API reguest */
mqttCloud.prototype.api = function (method, path, json, cb) {
    var headers = {
        "Content-Type": "application/json",
        "Authorization": this.type + " " + this.token,
        //"X-Auth-Token": this.token
    };

    this.adapter.log.debug(this.token);

    if (json !== null) headers["Content-Length"] = Buffer.byteLength(json, 'utf8');

    //this.adapter.log.info(JSON.stringify(headers));
    var options = {
        host: devCon.apiUrl,
        path: devCon.path + path,
        port: 443,
        method: method,
        headers: headers
    };

    var req = https.request(options, function (res) {
        var body = "";


        res.setEncoding('utf8');
        res.on('data', function (d) {
            body += d
        });
        res.on('end', function () {
            cb(JSON.parse(body))
        });
    });
    if (json !== null) req.write(json);
    req.on('error', function (e) {
        this.adapter.log.error("api errror " + e)
    });
    req.end();
};

module.exports = mqttCloud;