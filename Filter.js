var Node = require('blessed/lib/widgets/node');
var Input = require('blessed/lib/widgets/input');
var unicode = require('blessed/lib/unicode');
var nextTick = global.setImmediate || process.nextTick.bind(process);

/**
 * Filter
 */

function Filter(options) {
  var self = this;

  if (!(this instanceof Node)) {
    return new Filter(options);
  }

  options = options || {};

  options.scrollable = options.scrollable !== false;

  Input.call(this, options);

  this.screen._listenKeys(this);

  this.value = options.value || '';
  this.cursor = options.cursor || 0;

  this.__updateCursor = this._updateCursor.bind(this);
  this.on('resize', this.__updateCursor);
  this.on('move', this.__updateCursor);

  if (options.inputOnFocus) {
    this.on('focus', this.readInput.bind(this, null));
  }

  if (!options.inputOnFocus && options.keys) {
    this.on('keypress', function(ch, key) {
      if (self._reading) return;
      if (key.name === 'enter' || (options.vi && key.name === 'i')) {
        return self.readInput();
      }
      if (key.name === 'e') {
        return self.readEditor();
      }
    });
  }

  if (options.mouse) {
    this.on('click', function(data) {
      if (self._reading) return;
      if (data.button !== 'right') return;
      self.readEditor();
    });
  }
}

Filter.prototype.__proto__ = Input.prototype;

Filter.prototype.type = 'textarea';

Filter.prototype._updateCursor = function(get) {
  if (this.screen.focused !== this) {
    return;
  }

  var lpos = get ? this.lpos : this._getCoords();
  if (!lpos) return;

  var last = this._clines[this._clines.length - 1]
  , program = this.screen.program
  , line
  , cx
  , cy;

  // Stop a situation where the textarea begins scrolling
  // and the last cline appears to always be empty from the
  // _typeScroll `+ '\n'` thing.
  // Maybe not necessary anymore?
  if (last === '' && this.value[this._clines.length - 1] !== '\n') {
    last = this._clines[this._clines.length - 2] || '';
  }

  line = Math.min(
    this._clines.length - 1 - (this.childBase || 0),
    (lpos.yl - lpos.yi) - this.iheight - 1);

  // When calling clearValue() on a full textarea with a border, the first
  // argument in the above Math.min call ends up being -2. Make sure we stay
  // positive.
  line = Math.max(0, line);

  cy = lpos.yi + this.itop + line;
  cx = lpos.xi + this.ileft + this.cursor;

  // XXX Not sure, but this may still sometimes
  // cause problems when leaving editor.
  if (cy === program.y && cx === program.x) {
    return;
  }

  if (cy === program.y) {
    if (cx > program.x) {
      program.cuf(cx - program.x);
    } else if (cx < program.x) {
      program.cub(program.x - cx);
    }
  } else if (cx === program.x) {
    if (cy > program.y) {
      program.cud(cy - program.y);
    } else if (cy < program.y) {
      program.cuu(program.y - cy);
    }
  } else {
    program.cup(cy, cx);
  }
};

Filter.prototype.input =
  Filter.prototype.setInput =
  Filter.prototype.readInput = function(callback, changeCallback) {
	 var self = this
    , focused = this.screen.focused === this;

	 if (this._reading) return;
	 this._reading = true;

	 this._callback = callback;
	 this._change = changeCallback;

	 if (!focused) {
		this.screen.saveFocus();
		this.focus();
	 }

	 this.screen.grabKeys = true;

	 this._updateCursor();
	 this.screen.program.showCursor();
	 //this.screen.program.sgr('normal');

	 this._done = function fn(err, value) {
		if (!self._reading) return;

		if (fn.done) return;
		fn.done = true;

		self._reading = false;

		delete self._callback;
		delete self._done;

		self.removeListener('keypress', self.__listener);
		delete self.__listener;

		self.removeListener('blur', self.__done);
		delete self.__done;

		self.screen.program.hideCursor();
		self.screen.grabKeys = false;

		if (!focused) {
        self.screen.restoreFocus();
		}

		if (self.options.inputOnFocus) {
        self.screen.rewindFocus();
		}

		// Ugly
		if (err === 'stop') return;

		if (err) {
        self.emit('error', err);
		} else if (value != null) {
        self.emit('submit', value);
		} else {
        self.emit('cancel', value);
		}
		self.emit('action', value);

		if (!callback) return;

		return err
        ? callback(err)
        : callback(null, value);
	 };

	 // Put this in a nextTick so the current
	 // key event doesn't trigger any keys input.
	 nextTick(function() {
		self.__listener = self._listener.bind(self);
		self.on('keypress', self.__listener);
	 });

	 this.__done = this._done.bind(this, null, null);
	 this.on('blur', this.__done);
  };

Filter.prototype._listener = function(ch, key) {
  var done = this._done
  , value = this.value;

  if (key.name === 'return') return;
  if (key.name === 'enter') {
    ch = '\n';
  }

  // TODO: Handle directional keys.
  if (key.name === 'left') {
	 if (this.cursor > 0) {
		this.cursor--;
		this.screen.render();
	 }
  }

  if (key.name === 'right') {
	 if (this.cursor < this.value.length) {
		this.cursor++;
		this.screen.render();
	 }
  }

  if (key.name === 'a' && key.ctrl) {
	 if (this.cursor != 0) {
		this.cursor = 0;
		this.screen.render();
		return;
	 }
  }

  if (key.name === 'e' && key.ctrl) {
	 if (this.cursor != this.value.length) {
		this.cursor = this.value.length;
		this.screen.render();
		return;
	 }
  }

  if (key.name === 'k' && key.ctrl) {
	 if (this.cursor != this.value.length) {
		this.value = value.substring(0, this.cursor)
		this._change();
		this.screen.render();
		return;
	 }
  }

  if (this.options.keys && key.ctrl && key.name === 'e') {
    return this.readEditor();
  }

  // TODO: Optimize typing by writing directly
  // to the screen and screen buffer here.

  if (key.name === 'escape') {
    done(null, null);
  } else if (key.name === 'backspace') {
    if (this.value.length && this.cursor > 0) {
      this.value = value.substring(0, this.cursor - 1) + value.substring(this.cursor);
		this.cursor--;
    }
  } else if (ch) {
    if (!/^[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]$/.test(ch)) {
      this.value = value.substring(0, this.cursor) + ch + value.substring(this.cursor);
		this.cursor++;
    }
  }

  if (this.value !== value) {
	 this._change();
    this.screen.render();
  }
};

Filter.prototype._typeScroll = function() {
  // XXX Workaround
  var height = this.height - this.iheight;
  if (this._clines.length - this.childBase > height) {
    this.scroll(this._clines.length);
  }
};

Filter.prototype.getValue = function() {
  return this.value;
};

Filter.prototype.setValue = function(value) {
  if (value == null) {
    value = this.value;
  }
  if (this._value !== value) {
    this.value = value;
    this._value = value;
    this.setContent('{bold}' + this.value + '{/}');
    this._typeScroll();
    this._updateCursor();
  }
};

Filter.prototype.clearInput =
  Filter.prototype.clearValue = function() {
	 return this.setValue('');
  };

Filter.prototype.submit = function() {
  if (!this.__listener) return;
  return this.__listener('\x1b', { name: 'escape' });
};

Filter.prototype.cancel = function() {
  if (!this.__listener) return;
  return this.__listener('\x1b', { name: 'escape' });
};

Filter.prototype.render = function() {
  this.setValue();
  return this._render();
};

Filter.prototype.editor =
  Filter.prototype.setEditor =
  Filter.prototype.readEditor = function(callback) {
	 var self = this;

	 if (this._reading) {
		var _cb = this._callback
      , cb = callback;

		this._done('stop');

		callback = function(err, value) {
        if (_cb) _cb(err, value);
        if (cb) cb(err, value);
		};
	 }

	 if (!callback) {
		callback = function() {};
	 }

	 return this.screen.readEditor({ value: this.value }, function(err, value) {
		if (err) {
        if (err.message === 'Unsuccessful.') {
			 self.screen.render();
			 return self.readInput(callback);
        }
        self.screen.render();
        self.readInput(callback);
        return callback(err);
		}
		self.setValue(value);
		self.screen.render();
		return self.readInput(callback);
	 });
  };

/**
 * Expose
 */

module.exports = Filter;
