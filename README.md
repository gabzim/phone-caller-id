# caller-id

Node.js Phone caller Id using modem

Example

``` javascript

let Phone = require('phone-caller-id');

let phone = new Phone({
    port: '/dev/tty.usbmodem0000001',
    line: '3624422471',
    description: 'House'
});

phone.on('ringing', function (call) {
    console.log(`Ringing: ${call.number}`);
});
```
