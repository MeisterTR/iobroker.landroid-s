const http = require('http');
const https = require('https');
const uuidv1 = require('uuid/v1');
const mqtt = require('mqtt');

function LandroidCloud(adapter) {
    this.adapter = adapter;
    this.email = adapter.config.email;
    this.password = adapter.config.pwd;
    this.mower_sel = adapter.config.dev_sel;
    //this.macAddress = adapter.config.mac ? adapter.config.mac.toUpperCase().replace(/\:/g, '') : null;

    this.uuid = uuidv1();
    this.device;
    this.adapter.log.debug("UUID: " + this.uuid);
};


LandroidCloud.prototype.setToken = function (token) {
    this.token = token;
    this.adapter.log.debug("API token set to " + this.token);
};

/** Perform all initialization needed for connecting to the MQTT topic */
LandroidCloud.prototype.init = function (updateListener) {
    this.updateListener = updateListener;
    //this.retrieveGuestToken();
    this.setToken("qiJNz3waS4I99FPvTaPt2C2R46WXYdhw");
    this.retrieveUserToken();
}; 


/** Retrieve hard coded guest token from Pastebin 
LandroidCloud.prototype.retrieveGuestToken = function () {
    var self = this;

    this.get('https://pastebin.com/raw/xD6ZPULZ', function (body) {
        self.adapter.log.info("Downloaded guest token");
        self.setToken(body);

        self.retrieveUserToken();
    });
};
*/

/** Login and retrieve user token */
LandroidCloud.prototype.retrieveUserToken = function () {
    var self = this;

    var post = JSON.stringify({
        "email": self.email,
        "password": self.password,
        "uuid": self.uuid,
        "type": "app",
        "platform": "android",
    });
    self.adapter.log.debug("post:" + post);
    this.worx('POST', "users/auth", post, function (data) {
        //	{"message":"Wrong credentials","code":"401.003"}
        if (data.message === "Wrong credentials") {
            self.adapter.log.error("wrong email or password!");
            self.adapter.setState('info.connection', false, true);
        }
        else {
            self.token = data.api_token;
            self.mqtt_endpoint = data.mqtt_endpoint;
            self.mqtt_client_id = data.mqtt_client_id;
            self.adapter.log.info("Logged in as " + self.email + " API Token Set to : " + self.token);
            self.adapter.log.debug("Mqtt Server:  " + self.mqtt_endpoint);
            self.retrieveCaCert();
        }
    });
};

/** Retrieve CA certificate */
LandroidCloud.prototype.retrieveCaCert = function () {
    var self = this;

    this.get("https://www.symantec.com/content/en/us/enterprise/verisign/roots/VeriSign-Class%203-Public-Primary-Certification-Authority-G5.pem", function (data) {
        self.cert = data;
        //TO DO ERROR catch

        self.adapter.log.debug("CA certificate done");
        self.retrieveAwsCert();
    });
};

/** Retrieve AWS certificate */
LandroidCloud.prototype.retrieveAwsCert = function (updateListener) {

    //is this ok?
    if (updateListener) {
        this.updateListener = updateListener;
    }
    var self = this;

    this.worx('GET', "users/certificate", null, function (data) {

        if (typeof Buffer.from === "function") { // Node 6+
            try {
                self.p12 = Buffer.from(data.pkcs12, 'base64');
            }
            catch (e) {
                self.adapter.log.warn("Warning Buffer function  is empty, try new Buffer");
                self.p12 = new Buffer(data.pkcs12, 'base64');
            }

        } else {
            self.p12 = new Buffer(data.pkcs12, 'base64');
        }
        //TODO Konsole
        self.adapter.log.debug("AWS certificate done");

        //self.connectMqtt();
        self.worx('GET', "product-items", null, function (data) {

            if (data[self.mower_sel]) {
                self.adapter.log.info("mower " + self.mower_sel+ " selected");
                self.macAddress = data[self.mower_sel].mac_address;
                self.adapter.log.debug("Mac adress set to: " + data[self.mower_sel].mac_address);
                self.connectMqtt();
            }
            else {
                self.adapter.log.info("mower not found, fallback to first mower");
            self.macAddress = data[0].mac_address;
            self.adapter.log.debug("Mac adress set to: " + data[0].mac_address);

            self.connectMqtt();
            }
        });
    });
};

/** Connect Mqtt broker and ... */
LandroidCloud.prototype.connectMqtt = function () {
    var self = this;

    var options = {
        pfx: this.p12,
        caCert: this.cer,
        clientId: this.mqtt_client_id
    };

    self.device = mqtt.connect("mqtts://" + self.mqtt_endpoint, options);
    
    self.device.on('connect', function () {
        self.device.subscribe("DB510/" + self.macAddress + "/commandOut");
        self.adapter.log.debug("Mqtt connected!");
        self.device.publish("DB510/" + self.macAddress + "/commandIn", "{}");
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


LandroidCloud.prototype.sendMessage = function (message) {
    var topicIn = 'DB510/' + this.macAddress + '/commandIn';
    this.adapter.log.debug('Sending Message: ' + message);
    //var sends = '{"cmd":3}';
    this.device.publish(topicIn, message);
};

/** New MQTT message received */
LandroidCloud.prototype.onMessage = function (payload) {
    var data = payload.dat;
    if (data) {
        // this.adapter.log.info('MQTT message received: ' + JSON.stringify(data));

        this.adapter.log.debug("Landroid status: " + JSON.stringify(payload));

        if (this.updateListener) {
            this.updateListener(payload);
        }
    }
    else
        this.adapter.log.warn("No 'dat' in message payload! " + JSON.stringify(payload));
};

/** Simple get request to url **/
LandroidCloud.prototype.get = function (url, cb) {
    var req = https.get(url).on('response', function (res) {
        var body = "";

        console.log("get " + ' ' + url + " -> ", res.statusCode);
        res.on('data', function (d) { body += d });
        res.on('end', function () { cb(body) });
    });
    req.on('error', function (e) { console.error("get error " + e) });
};

/** Worx API reguest */
LandroidCloud.prototype.worx = function (method, path, json, cb) {
    var headers = {
        "Content-Type": "application/json",
        "X-Auth-Token": this.token
    };
    this.adapter.log.debug(this.token);
    if (json !== null) headers["Content-Length"] = Buffer.byteLength(json, 'utf8');
    var options = {
        host: "api.worxlandroid.com",
        path: "/api/v1/" + path,
        port: 443,
        method: method,
        headers: headers
    };

    var req = https.request(options, function (res) {
        var body = "";


        res.setEncoding('utf8');
        res.on('data', function (d) { body += d });
        res.on('end', function () { cb(JSON.parse(body)) });
    });
    if (json !== null) req.write(json);
    req.on('error', function (e) { this.adapter.log.error("worx errror " + e) });
    req.end();
};

module.exports = LandroidCloud;
