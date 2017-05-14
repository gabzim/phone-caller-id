let Phone = require('../index');

let phone = new Phone({
    port: '/dev/tty.usbmodem0000001',
    line: '3624422471',
    description: 'House'
});

phone.on('ringing', function (call) {
    console.log(`Ringing: ${call.number}`);
});