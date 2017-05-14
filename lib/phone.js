let EventEmitter = require('events').EventEmitter;
let bluebird = require('bluebird');
let promisifyAll = bluebird.promisifyAll;
let SerialPort = require('serialport');
promisifyAll(SerialPort);

let moment = require('moment');

let codes = {
    ring: '\u0010R',
    number: 'NMBR=',
    dial: '\u0010d',
    busy: '\u0010b',
};

let secondsInBetweenRings = 4;


function extractPhoneNumber(string) {
    let number = string.indexOf(codes.number);
    if (number < 0) {
        return null;
    }
    let phoneNumber = string.substring(number + 5, string.length - 1);
    phoneNumber = phoneNumber.replace(/\D/g, '');
    return phoneNumber;
}

class Phone extends EventEmitter {

    constructor({port, line, description}) {
        super();
        this.line = line;
        this.description = description;
        this.serialPort = new SerialPort(port);
        promisifyAll(this.serialPort);
        this.serialPort.on('open', this.init.bind(this));
    }

    async init() {
        await this.activateVoiceMode();
        await this.activateCallerId();
        await this.setUpListener();
        await this.hangUp();
        this.emit('init');
    }

    async activateVoiceMode() {
        await this.serialPort.writeAsync('AT+FCLASS=8\r');
        await this.serialPort.drainAsync();
    }

    async activateCallerId() {
        await this.serialPort.writeAsync('AT+VCID=1\r');
        await this.serialPort.drainAsync();
    }

    async setUpListener() {
        this.serialPort.on('data', async data => {
            let msg = Buffer.from(data, 'ascii').toString();
            this.lastEventAt = moment();
            // If data contains a phone number extract it and trigger current call.
            let phoneNumber = extractPhoneNumber(msg);

            if (phoneNumber) {
                this.startCall(phoneNumber);
                return;
            }

            if (msg === codes.ring) {
                this.ring();
                return;
            }
        });
    }

    async startCall(phoneNumber) {
        this.ongoingCall = {
            line: this.line,
            description: this.description,
            number: phoneNumber,
            startedAt: moment(),
            rings: 1,
        };

        this.emit('ringing.start', this.ongoingCall);
        this.emit('ringing', this.ongoingCall);
        this.setCheck();
    }

    async endCall() {
        if (this.ongoingCall) {
            this.emit('ringing.end', this.ongoingCall);
        }
        this.ongoingCall = null;
    }

    async ring() {
        if (this.lastRingAt) {
            let secondsFromLastRing = moment().diff(this.lastRingAt, 'seconds');
            if (secondsFromLastRing <= secondsInBetweenRings) {
                this.ongoingCall.rings++;
                this.emit('ringing', this.ongoingCall);
            }
        }
        this.lastRingAt = moment();
        this.setCheck();
    }

    async setCheck() {
        let checkAgainIn = secondsInBetweenRings * 1000 + 1000; // 1 more seconds after it stops ringing

        if (this.check) {
            clearTimeout(this.check);
        }
        this.check = setTimeout(async () => {
            let ringSecondsAgo = moment().diff(this.lastRingAt, 'seconds');
            if (ringSecondsAgo <= secondsInBetweenRings) {
                return this.setCheck();
            }
            this.endCall();
        }, checkAgainIn);
    }
}

Phone.listPorts = function () {
    return SerialPort.listAsync();
};

module.exports = Phone;