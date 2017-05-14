let EventEmitter = require('events').EventEmitter;
let bluebird = require('bluebird');
let promisifyAll = bluebird.promisifyAll;
let SerialPort = require('serialport');
let moment = require('moment');

let codes = {
    ring: '\u0010R',
    number: 'NMBR=',
    dial: '\u0010d',
    busy: '\u0010b',
};

/** WIP **/

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

    constructor(port) {
        super();
        this.serialPort = new SerialPort(port);
        promisifyAll(this.serialPort);
        this.serialPort.on('open', this.init.bind(this));
    }

    async init() {
        await this.setToVoiceMode();
        await this.setUpListener();
        this.emit('init');
    }

    async setToVoiceMode() {
        await this.serialPort.writeAsync('AT+FCLASS=8\r');
        await this.serialPort.drainAsync();
        await this.serialPort.writeAsync('AT+VCID=1\r');
        await this.serialPort.drainAsync();
        await this.hangUp();
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

            // console.log(JSON.stringify(msg));

            if (msg === codes.ring) {
                this.ring();
                return;
            }

            if (msg === codes.dial) {
                this.endCall();
            }

            if (msg === codes.busy) {
                this.endCall();
            }
        });
    }

    async startCall(phoneNumber) {
        this.ongoingCall = {
            number: phoneNumber,
            startedAt: moment(),
            rings: 1,
            pickedUpAt: null,
            hungUpAt: null,
        };

        this.emit('call.incoming', this.ongoingCall);
        this.emit('ringing', this.ongoingCall);
        this.setCheck();
    }

    async endCall() {
        if (this.ongoingCall) {
            if (this.ongoingCall.pickedUpAt) {
                this.ongoingCall.hungUpAt = moment();
                this.ongoingCall.duration = this.ongoingCall.pickedUpAt.diff(this.ongoingCall.hungUpAt, 'seconds');
                this.emit('call.end', this.ongoingCall);
            } else {
                this.emit('ringing.end', this.ongoingCall);
            }
        }
        this.ongoingCall = null;
        await this.hangUp();
    }

    async ring() {
        if (this.lastRingAt) {
            let lastRingAgo = moment().diff(this.lastRingAt, 'seconds');
            if (lastRingAgo === 4) {
                this.ongoingCall.rings++;
                this.emit('ringing', this.ongoingCall);
            }
        }
        this.lastRingAt = moment();
        this.setCheck();
    }

    async pickUp() {
        await this.serialPort.writeAsync('AT+VLS=5\r');
        await this.serialPort.drainAsync();
    }

    async hangUp() {
        await this.serialPort.writeAsync('AT+VLS=0\r');
        await this.serialPort.drainAsync();
    }

    async setCheck() {
        if (this.check) {
            clearTimeout(this.check);
        }
        this.check = setTimeout(async () => {
            let ringSecondsAgo = moment().diff(this.lastRingAt, 'seconds');
            if (ringSecondsAgo > 4) {
                await this.pickUp();
                setTimeout(() => {
                    if (this.ongoingCall) {
                        this.ongoingCall.pickedUpAt = moment();
                        this.emit('call.start', this.ongoingCall);
                    }
                }, 4000);
            }
        }, 5000);
    }
    
    async checkIfPickedUp() {
        
    }
}

module.exports = Phone;