const http = require('http');
const https = require('https');
const uuidv1 = require('uuid/v1');
const mqtt = require('mqtt');

var types = {
    25: "DB510",
    40: "DB510",    //S700 WR115MI
    24: "DB510",    //S500i WR105SI
    35: "DB510",    // WR103SI
    37: "DB510",    // SO500i WR105SI
    34: "DB510",
    28: "DB504",
    30: "DB504"
};

function LandroidCloud(adapter) {
    this.adapter = adapter;
    this.email = adapter.config.email;
    this.password = adapter.config.pwd;
    this.mower_sel = adapter.config.dev_sel;
    this.uuid = uuidv1();
    this.device;
    this.modell;
    this.adapter.log.debug("UUID: " + this.uuid);

    this.adapter.log.warn("landroid-cloud-2.js will be replaced in next version by mqttCloud.js and worxConfig.js. Reason: better handling of models and mqttCloud supports more brands by a diffent config see also: https://www.npmjs.com/package/iobroker.kress");
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
            //self.adapter.log.info(JSON.stringify(data));
            self.token = data.api_token;
            self.mqtt_endpoint = data.mqtt_endpoint;
            self.mqtt_client_id = data.mqtt_client_id;
            self.adapter.log.info("Logged in as " + self.email + " API Token Set to : " + self.token);
            self.adapter.log.debug("Mqtt Server:  " + self.mqtt_endpoint);
            self.retrieveAwsCert();
        }
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
            self.adapter.log.debug("product "+JSON.stringify(data));

            if (data[self.mower_sel]) {
                self.adapter.log.info("mower " + self.mower_sel + " selected");
                self.macAddress = data[self.mower_sel].mac_address;

                self.adapter.log.info(types[data[self.mower_sel].product_id]);

                if (typeof types[data[self.mower_sel].product_id] !== "undefined") {
                    self.modell = types[data[self.mower_sel].product_id];

                } else {
                    self.adapter.log.warn("product_id: " + data[self.mower_sel].product_id + " Plese make an issue on git with this product id");
                    //self.adapter.setState('info.connection', false, true);
                    
                    self.modell = "DB510";
                    //return

                }

                self.adapter.log.debug("Mac adress set to: " + data[self.mower_sel].mac_address);
                self.connectMqtt();
            }
            else {
                self.adapter.log.info("mower not found, fallback to first mower");
                self.macAddress = data[0].mac_address;
                self.adapter.log.debug("Mac adress set to: " + data[0].mac_address);

                self.connectMqtt();
            }
            self.worx('GET', "boards", null, function(data) { // + this.snr
              self.adapter.log.debug("Board: " + JSON.stringify(data))
               //self.connectMqtt()
            })
        });
    });
};

/** Connect Mqtt broker and ... */
LandroidCloud.prototype.connectMqtt = function () {
    var self = this;

    var options = {
        pfx: this.p12,
        clientId: this.mqtt_client_id
    };

    self.device = mqtt.connect("mqtts://" + self.mqtt_endpoint, options);

    self.device.on('connect', function () {
        self.device.subscribe(self.modell+ "/" + self.macAddress + "/commandOut");
        self.adapter.log.debug("Mqtt connected!");
        self.device.publish(self.modell + "/" + self.macAddress + "/commandIn", "{}");
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
    var topicIn = this.modell + "/" + this.macAddress + '/commandIn';
    this.adapter.log.debug('Sending Message: ' + message);
    //var sends = '{"cmd":3}';
    this.device.publish(topicIn, message);
};

/** New MQTT message received */
LandroidCloud.prototype.onMessage = function (payload) {
    var data = payload.dat;
    if (data) {
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
