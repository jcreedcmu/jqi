var spawn = require('child_process').spawn;
var blessed = require('blessed');
var Filter = require('./Filter');

var file = process.argv[2];
if (file == null) {
  console.log('usage: node ' + process.argv[1] + ' file');
  process.exit(1);
}
var data = JSON.parse(require('fs').readFileSync(file, 'utf8'));

var screen = blessed.screen({
  smartCSR: true,
  dockBorders: true,
});

screen.title = 'jqi';

var json = blessed.box({
  top: '0',
  left: '0',
  width: '100%',
  height: '100%-3',
  content: JSON.stringify(data, null, 2),
  tags: true,
  border: {
    type: 'line'
  },
  style: {
//     fg: 'green',
    // bg: 'white',
    // border: {
    //   fg: '#ff0000'
    // }
  }
});

var debug = blessed.box({
  top: '0%',
  left: '50%',
  width: '50%',
  height: '100%-3',
  content: '',
  border: {
    type: 'line',
	 fg: '#f00',
  }
});
debug.hide();

var filter = new Filter({
  top: '100%-3',
  left: '0',
  width: '100%',
  height: '0+1',
  value: '',
  tags: true,
});

// var status = blessed.box({
//   top: '100%-2',
//   left: '0',
//   width: '100%',
//   height: '0+1',
//   content: '{red-fg}nope{/}',
//   tags: true,
// });

screen.append(filter);
screen.append(json);
screen.append(debug);
//screen.append(status);

screen.key(['escape'], function(ch, key) {
  return process.exit(0);
});

filter.key(['escape'], function(ch, key) {
  return process.exit(0);
});

function stringify(json) {
  if (json[0] == null) {
	 throw "boring";
  }
  return json.map(x => {
	 const oneline = JSON.stringify(x);
	 if (oneline.length < 60) return oneline;
	 else return JSON.stringify(x, null, 2);
  }).join("\n");
}

function changed() {
  var child = spawn('jq', ['[' + filter.value + ']' , file]);
  var buf = "";
  var err = "";
  child.stdout.on('data', data => buf = buf + data);
  child.stderr.on('data', data => err = err + data);
  child.on('close', (x) => {
	 if (x == 0) {
		try {
		  debug.hide();
		  json.setContent(stringify(JSON.parse(buf)));
		  debug.setContent('');
		}
		catch (e) {
		  debug.show();
		  debug.visible = true;
		}
	 }
	 else {
		// parse error message
		debug.show();
		debug.setContent(err);

		//// I thought jq gave column numbers or otherwise indicated
		/// where syntax errors happen in the jq program. Apparently not.

		// var m = err.match(/jq: error.*\n(.*)\n/);
		// if (m) {
		//   status.setContent(m[1]);
		// }
	 }
	 screen.render();
  });
}

filter.focus();
filter.readInput(null, changed);

screen.render();

// if (/*debug*/ 1 ) {
//   var net = require('net');

//   var server = net.createServer(function(socket) {
// 	 socket.write('Echo server\r\n');
// 	 socket.on('data', function( x) {
// 		try {
// 		  debug.setContent(JSON.stringify(eval(x.toString('utf8'))));
// 		} catch (e) {
// 		  debug.setContent(e.toString());
// 		}
// 		screen.render();
// 	 });
//   });

//   server.listen(1337, '127.0.0.1');
// }
