var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
export var C_BASE_KEY_INDEX = 39; // 0...n
export var C_BASE_NOTE_INDEXES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export var SCALE = 12;
export var TOTAL_NUM_OF_KEYS = 88;
export var A_BASE_KEY_INDEX = 48; // 0...n
export var A_BASE_FREQUENCY = 440;
export var QUARTER_NOTE = 4;
export var BASE_OCTAVE = 4;
export var MML;
(function (MML) {
    var notes;
    var audioContext;
    var gain;
    var filter;
    var scheduleTime = 0.1;
    var lookahead = 25;
    var startTime = 0;
    var sequences = [];
    var playInterval;
    var header;
    MML.initialize = function () {
        var AudioContext = window['AudioContext'] // Default
            || window['webkitAudioContext'] // Safari and old versions of Chrome
            || window['mozAudioContext']
            || window['oAudioContext']
            || window['msAudioContext']
            || false;
        audioContext = new AudioContext();
        filter = audioContext.createBiquadFilter();
        gain = audioContext.createGain();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(700, 0);
        filter.connect(gain);
        // gain.gain.setValueAtTime(0.5, 0);
        gain.connect(audioContext.destination);
        calculateNotes();
    };
    var calculateNotes = function () {
        notes = [];
        var keys = ['a', 'a+', 'b', 'c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+'];
        var newOctaveIndex = 3;
        var octave = 0;
        var keyIndex = 0;
        for (var n = 0; n < TOTAL_NUM_OF_KEYS; n++) {
            var frequency = Math.pow(2, ((n - A_BASE_KEY_INDEX) / SCALE)) * A_BASE_FREQUENCY;
            var key = keys[keyIndex];
            var nextKey = (keyIndex + 1) % keys.length;
            octave = octave + (keyIndex === newOctaveIndex ? 1 : 0);
            var alt = key.slice(-1) === "#" ? keys[nextKey][0] + '-' : '';
            notes.push({ index: n, key: key, octave: octave, alt: alt, frequency: frequency });
            keyIndex = nextKey;
        }
    };
    MML.getNotes = function () {
        return notes;
    };
    MML.readMML = function (mmlString) {
        var mmls = mmlString.toLowerCase().replace(/\s/g, '').split(';');
        var headerMML = '';
        for (var i = mmls.length - 1; i >= 0; i--) {
            var mml = mmls[i];
            if (mml.includes('%')) {
                headerMML = mmls.splice(i, 1)[0];
                break;
            }
        }
        header = new Sequence(headerMML);
        header.parseMML();
        mmls.map(function (mml) {
            if (!mml)
                return;
            var sequence = new Sequence(mml);
            sequences.push(sequence);
        });
        sequences.map(function (sequence) {
            sequence.parseMML();
        });
    };
    MML.writeToMML = function () {
        return (header && header.writeToMML() || '').concat(sequences.map(function (sequence) {
            return sequence.writeToMML();
        }).join(""));
    };
    MML.playMML = function () {
        if (!startTime) {
            startTime = audioContext.currentTime;
        }
        var relativeScheduleTime = audioContext.currentTime + scheduleTime;
        header && header.playMML(startTime, relativeScheduleTime);
        sequences.map(function (sequence) {
            sequence.playMML(startTime, relativeScheduleTime);
        });
    };
    MML.stop = function () {
        clearInterval(playInterval);
        gain.disconnect(audioContext.destination);
        startTime = null;
        header && header.resetPlayState();
        sequences.map(function (sequence) {
            sequence.resetPlayState();
        });
        MML.initialize();
    };
    MML.play = function () {
        MML.stop();
        playInterval = setInterval(MML.playMML, lookahead);
    };
    MML.getDurationFromExtensions = function (note) {
        if (!note.extensions)
            return;
        var duration = note.extensions[0];
        note.extensions.slice(1).map(function (extension) {
            duration = MML.Sequence.calculateDurationFromNewExtension(duration, extension);
        });
        return duration;
    };
    // 1bpm = 1s -> 1beat= 1/60s, 1beat = 4 defaultDuration
    MML.convertDurationToSeconds = function (note, tempo) {
        var duration = MML.getDurationFromExtensions(note);
        if (duration === 0 || tempo === 0) {
            return Number.MAX_VALUE;
        }
        return (QUARTER_NOTE / duration) * 60 / tempo;
    };
    MML.playNote = function (note, tempo, scheduledStartTime) {
        if (!scheduledStartTime)
            scheduledStartTime = audioContext.currentTime;
        var oscillators = [];
        var numberOfOscillators = 2;
        for (var i = 0; i < numberOfOscillators; i++) {
            var osc = audioContext.createOscillator();
            osc.frequency.value = notes[note.index].frequency;
            switch (i % 2) {
                case 0:
                    osc.type = 'sawtooth';
                    osc.detune.value = -5;
                    break;
                case 1:
                    osc.type = 'sine';
                    osc.detune.value = 5;
                    break;
            }
            osc.connect(filter);
            osc.start(scheduledStartTime);
            osc.stop(scheduledStartTime + MML.convertDurationToSeconds(note, tempo));
            oscillators.push(osc);
        }
        return oscillators;
    };
    MML.getHeaderNotesInQueue = function () {
        return header && header.notesInQueue;
    };
    MML.getNotesInQueue = function () {
        return sequences.map(function (sequence) {
            return sequence.notesInQueue;
        });
    };
    var Sequence = /** @class */ (function () {
        function Sequence(mml) {
            var _this = this;
            this.tempo = 120;
            this.octave = BASE_OCTAVE;
            this.extensions = [QUARTER_NOTE];
            this.defaultExtensions = [QUARTER_NOTE];
            this.chordNoteIndexes = [];
            this.readingChord = false;
            this.mmlIndex = 0;
            this.goToNext = false;
            this.isHeader = false;
            this.notesInQueue = [];
            this.resetPlayState = function () {
                _this.playState = {
                    index: 0,
                    nextNoteTime: 0,
                    chord: false,
                    tempo: 120,
                    startLoopIndex: -1,
                    loopCount: -1,
                    endLoopIndex: -1,
                    infiniteLoopIndex: -1,
                    loopNoteTime: 0,
                    startLoopOffset: 0,
                    endLoopOffset: 0,
                };
            };
            this.expect = function (reg) {
                if (!reg.test(_this.mml[_this.mmlIndex])) {
                    throw new Error('Invalid MML syntax.\n' +
                        'Expected: ' + reg + ', Got: ' + _this.mml[_this.mmlIndex]);
                }
            };
            this.isThisValid = function (reg) {
                return _this.goToNext = _this.mml[_this.mmlIndex] && _this.mml[_this.mmlIndex].trim() && reg.test(_this.mml[_this.mmlIndex]);
            };
            this.isNextValid = function (reg) {
                _this.mmlIndex++;
                return _this.isThisValid(reg);
            };
            this.getOctaveOffset = function () {
                return (_this.octave - BASE_OCTAVE) * SCALE;
            };
            this.readNextLength = function () {
                var length = 0;
                do {
                    if (_this.isThisValid(/\d/)) {
                        length = length * 10 + parseInt(_this.mml[_this.mmlIndex]);
                    }
                } while (_this.isNextValid(/\d/));
                return [].concat(length === 0 ? _this.defaultExtensions : length);
            };
            this.getDuration = function () {
                var _a;
                _this.expect(/[\dl^.~]/);
                _this.extensions = _this.defaultExtensions;
                var changeDefaultDuration = false;
                while (_this.isThisValid(/[\dl^.~]/)) {
                    switch (_this.mml[_this.mmlIndex]) {
                        case 'l':
                            changeDefaultDuration = true;
                            _this.extensions = _this.readNextLength();
                            break;
                        case '^':
                            _this.extensions = _this.extensions.concat(_this.readNextLength());
                            break;
                        case '.':
                            do {
                                var extension = _this.extensions[_this.extensions.length - 1] * 2;
                                _this.extensions.push(extension);
                            } while (_this.isNextValid(/\./));
                            break;
                        case '~':
                            _this.extensions = (_a = _this.extensions).concat.apply(_a, new Array(_this.readNextLength()[0]).fill(_this.extensions[0]));
                            break;
                        default: {
                            _this.extensions = _this.readNextLength();
                            break;
                        }
                    }
                }
                if (changeDefaultDuration) {
                    _this.defaultExtensions = _this.extensions;
                    _this.notesInQueue.push({
                        type: "default-duration",
                        extensions: _this.defaultExtensions
                    });
                }
            };
            this.saveNote = function (noteIndex) {
                _this.notesInQueue.push({
                    type: 'note',
                    index: noteIndex,
                    extensions: _this.extensions,
                });
            };
            this.nextNote = function () {
                _this.extensions = _this.defaultExtensions;
            };
            this.getNote = function () {
                _this.expect(/[cdefgab]/);
                var noteIndex = C_BASE_NOTE_INDEXES[_this.mml[_this.mmlIndex]] + C_BASE_KEY_INDEX + _this.getOctaveOffset();
                if (_this.isNextValid(/[-+#\d^.]/)) {
                    switch (_this.mml[_this.mmlIndex]) {
                        case '-':
                            noteIndex--;
                            break;
                        case '+':
                        case '#':
                            noteIndex++;
                            break;
                        default:
                            if (_this.readingChord) {
                                break;
                            }
                            _this.getDuration();
                            break;
                    }
                }
                if (_this.readingChord) {
                    _this.chordNoteIndexes.push(noteIndex);
                    return;
                }
                _this.saveNote(noteIndex);
            };
            this.getOctave = function () {
                _this.expect(/o/);
                if (_this.isNextValid(/\d/)) {
                    _this.octave = parseInt(_this.mml[_this.mmlIndex]);
                    _this.notesInQueue.push({ type: "octave", octave: _this.octave });
                }
            };
            this.decreaseOctave = function () {
                _this.expect(/>/);
                if (_this.isNextValid(/\d/)) {
                    _this.octave -= parseInt(_this.mml[_this.mmlIndex]);
                }
                else {
                    _this.octave--;
                }
                _this.notesInQueue.push({ type: "octave", octave: _this.octave });
            };
            this.increaseOctave = function () {
                _this.expect(/</);
                if (_this.isNextValid(/\d/)) {
                    _this.octave += parseInt(_this.mml[_this.mmlIndex]);
                }
                else {
                    _this.octave++;
                }
                _this.notesInQueue.push({ type: "octave", octave: _this.octave });
            };
            this.getTempo = function () {
                _this.expect(/t/);
                var newTempo = 0;
                while (_this.isNextValid(/\d/)) {
                    newTempo = newTempo * 10 + parseInt(_this.mml[_this.mmlIndex]);
                }
                _this.tempo = newTempo;
                _this.notesInQueue.push({ type: "tempo", tempo: _this.tempo });
            };
            this.getRest = function () {
                _this.expect(/r/);
                if (_this.isNextValid(/[\d^.]/)) {
                    _this.getDuration();
                }
                _this.notesInQueue.push({
                    type: 'rest',
                    extensions: _this.extensions,
                });
            };
            this.getChord = function () {
                _this.expect(/\[/);
                _this.readingChord = true;
                _this.chordNoteIndexes = [];
                _this.notesInQueue.push({ type: 'start-chord' });
            };
            this.playChord = function () {
                _this.expect(/]/);
                if (_this.isNextValid(/[\d^.]/)) {
                    _this.getDuration();
                }
                _this.chordNoteIndexes.map(function (noteIndex) {
                    _this.saveNote(noteIndex);
                });
                _this.readingChord = false;
                _this.chordNoteIndexes = [];
                _this.notesInQueue.push({
                    type: 'end-chord',
                    extensions: _this.extensions,
                });
            };
            this.setInfiniteLoop = function () {
                _this.expect(/$/);
                _this.mmlIndex++;
                _this.notesInQueue.push({ type: 'infinite-loop' });
            };
            this.startLoop = function () {
                _this.expect(/\//);
                _this.mmlIndex++;
                _this.expect(/:/);
                _this.mmlIndex++;
                _this.notesInQueue.push({ type: 'start-loop' });
            };
            this.endLoop = function () {
                _this.expect(/:/);
                _this.mmlIndex++;
                _this.expect(/\//);
                var loopTimes = 0;
                while (_this.isNextValid(/\d/)) {
                    loopTimes = loopTimes * 10 + parseInt(_this.mml[_this.mmlIndex]);
                }
                if (loopTimes === 0) {
                    loopTimes = 2;
                }
                _this.notesInQueue.push({ type: 'end-loop', times: loopTimes });
            };
            this.breakLoop = function () {
                _this.expect(/\|/);
                _this.notesInQueue.push({ type: 'break-loop' });
            };
            this.setHeader = function () {
                _this.expect(/%/);
                _this.notesInQueue.push({ type: 'header' });
                _this.isHeader = true;
            };
            this.parseMML = function () {
                while (_this.mmlIndex < _this.mml.length) {
                    var prevMMLIndex = _this.mmlIndex;
                    _this.nextNote();
                    switch (_this.mml[_this.mmlIndex]) {
                        case 'c':
                        case 'd':
                        case 'e':
                        case 'f':
                        case 'g':
                        case 'a':
                        case 'b':
                            _this.getNote();
                            break;
                        case '[':
                            _this.getChord();
                            break;
                        case ']':
                            _this.playChord();
                            break;
                        case 'r':
                            _this.getRest();
                            break;
                        case 'l':
                            _this.getDuration();
                            break;
                        case 'o':
                            _this.getOctave();
                            break;
                        case '>':
                            _this.decreaseOctave();
                            break;
                        case '<':
                            _this.increaseOctave();
                            break;
                        case 't':
                            _this.getTempo();
                            break;
                        case '$':
                            _this.setInfiniteLoop();
                            break;
                        case '/':
                            _this.startLoop();
                            break;
                        case ':':
                            _this.endLoop();
                            break;
                        case '|':
                            _this.breakLoop();
                            break;
                        case '%':
                            _this.setHeader();
                            break;
                        default:
                            _this.goToNext = true;
                            break;
                    }
                    if (_this.goToNext || prevMMLIndex === _this.mmlIndex) {
                        _this.mmlIndex++;
                        _this.goToNext = false;
                    }
                }
            };
            this.playMML = function (relativeStartTime, relativeScheduleTime) {
                while (_this.playState.nextNoteTime < relativeScheduleTime
                    && (_this.isHeader || !header || _this.playState.nextNoteTime < header.playState.nextNoteTime)
                    && _this.playState.index < _this.notesInQueue.length) {
                    if (!_this.isHeader && header) {
                        _this.playState.tempo = header.tempo;
                        if (header.playState.startLoopIndex >= 0 && _this.playState.startLoopIndex < 0) {
                            _this.playState.startLoopIndex = _this.playState.index;
                            _this.playState.startLoopOffset = header.playState.loopNoteTime - _this.playState.nextNoteTime;
                            if (_this.playState.startLoopOffset < 0)
                                _this.playState.startLoopOffset = 0;
                        }
                        else if (header.playState.endLoopIndex >= 0 && _this.playState.endLoopIndex < 0) {
                            _this.playState.endLoopIndex = _this.playState.index;
                            _this.playState.endLoopOffset = header.playState.loopNoteTime - _this.playState.nextNoteTime;
                            if (_this.playState.endLoopOffset < 0)
                                _this.playState.endLoopOffset = 0;
                            _this.playState.loopCount = header.playState.loopCount;
                            _this.playState.index = _this.playState.startLoopIndex;
                            _this.playState.nextNoteTime += _this.playState.startLoopOffset;
                        }
                        else if (header.playState.loopCount !== _this.playState.loopCount) {
                            if (header.playState.loopCount < 0) {
                                _this.playState.index = _this.playState.endLoopIndex;
                                _this.playState.nextNoteTime += _this.playState.endLoopOffset;
                                _this.playState.loopCount = -1;
                                _this.playState.startLoopIndex = -1;
                                _this.playState.endLoopIndex = -1;
                            }
                            else {
                                _this.playState.index = _this.playState.startLoopIndex;
                                _this.playState.nextNoteTime += _this.playState.startLoopOffset;
                                _this.playState.loopCount = header.playState.loopCount;
                            }
                        }
                    }
                    var prevPlayState = _this.playState;
                    _this.playState = __assign({}, _this.playState);
                    var note = _this.notesInQueue[_this.playState.index];
                    switch (note.type) {
                        case 'start-loop':
                            _this.playState.startLoopIndex = _this.playState.index;
                            _this.playState.loopNoteTime = _this.playState.nextNoteTime;
                            break;
                        case 'end-loop':
                            if (_this.playState.loopCount < 0) {
                                _this.playState.endLoopIndex = _this.playState.index;
                                _this.playState.loopCount = note.times;
                                _this.playState.loopNoteTime = _this.playState.nextNoteTime;
                            }
                            _this.playState.loopCount--;
                            if (_this.playState.loopCount > 0) {
                                _this.playState.index = _this.playState.startLoopIndex;
                            }
                            else {
                                _this.playState.loopCount = -1;
                                _this.playState.startLoopIndex = -1;
                                _this.playState.endLoopIndex = -1;
                            }
                            break;
                        case 'break-loop':
                            if (_this.playState.loopCount === 1) {
                                _this.playState.index = _this.playState.endLoopIndex;
                                _this.playState.loopCount = -1;
                                _this.playState.startLoopIndex = -1;
                                _this.playState.endLoopIndex = -1;
                            }
                            break;
                        case 'infinite-loop':
                            _this.playState.infiniteLoopIndex = _this.playState.index;
                            break;
                        case 'tempo':
                            _this.playState.tempo = note.tempo;
                            break;
                        case 'start-chord':
                            _this.playState.chord = true;
                            break;
                        case 'end-chord':
                            _this.playState.chord = false;
                            _this.playState.nextNoteTime += MML.convertDurationToSeconds(note, _this.playState.tempo);
                            break;
                        case 'rest':
                            _this.playState.nextNoteTime += MML.convertDurationToSeconds(note, _this.playState.tempo);
                            break;
                        case 'note':
                            MML.playNote(note, _this.playState.tempo, relativeStartTime + _this.playState.nextNoteTime);
                            if (_this.playState.chord)
                                break;
                            _this.playState.nextNoteTime += MML.convertDurationToSeconds(note, _this.playState.tempo);
                            break;
                    }
                    if (_this.playState.infiniteLoopIndex >= 0 && _this.playState.index >= _this.notesInQueue.length - 1) {
                        _this.playState.index = _this.playState.infiniteLoopIndex;
                    }
                    _this.playState.index++;
                    if (_this.isHeader && prevPlayState.nextNoteTime !== _this.playState.nextNoteTime)
                        break;
                }
            };
            this.stringifyNoteKey = function (note) {
                return notes[note.index].key;
            };
            this.stringifyNoteDuration = function (note, defaultExtension) {
                var mmlDuration = "";
                var prevExtension = note.extensions[0];
                var occurrences = 1;
                mmlDuration += note.extensions.join('') === defaultExtension.join('') ? "" : prevExtension;
                note.extensions.slice(1).map(function (extension) {
                    if (prevExtension === extension) {
                        if (occurrences === 1) {
                            mmlDuration += '~';
                        }
                        occurrences++;
                    }
                    else {
                        if (occurrences > 1) {
                            mmlDuration += occurrences;
                            occurrences = 1;
                        }
                        if (prevExtension === (extension / 2)) {
                            mmlDuration += '.';
                        }
                        else {
                            mmlDuration += '^' + extension;
                        }
                    }
                    prevExtension = extension;
                });
                if (occurrences > 1)
                    mmlDuration += occurrences;
                return mmlDuration;
            };
            this.writeToMML = function () {
                var mmlText = "";
                var defaultExtensions = [QUARTER_NOTE];
                _this.notesInQueue.map(function (note) {
                    switch (note.type) {
                        case "infinite-loop":
                            mmlText += "$";
                            break;
                        case "octave":
                            mmlText += "o" + note.octave;
                            break;
                        case "tempo":
                            mmlText += "t" + note.tempo;
                            break;
                        case "default-duration":
                            mmlText += "l" + _this.stringifyNoteDuration(note, []);
                            defaultExtensions = note.extensions;
                            break;
                        case "start-loop":
                            mmlText += "/:";
                            break;
                        case "end-loop":
                            mmlText += ":/" + note.times;
                            break;
                        case "break-loop":
                            mmlText += "|";
                            break;
                        case "header":
                            mmlText += "%";
                            break;
                        case "start-chord":
                            mmlText += "[";
                            break;
                        case "end-chord":
                            mmlText += "]" + _this.stringifyNoteDuration(note, defaultExtensions);
                            break;
                        case "rest":
                            mmlText += "r" + _this.stringifyNoteDuration(note, defaultExtensions);
                            break;
                        case "note":
                            mmlText += _this.stringifyNoteKey(note) + _this.stringifyNoteDuration(note, defaultExtensions);
                            break;
                    }
                });
                mmlText += ";";
                return mmlText;
            };
            this.mml = mml;
            if (header) {
                this.tempo = header.tempo;
                this.defaultExtensions = header.defaultExtensions;
                this.extensions = header.extensions;
            }
            this.resetPlayState();
        }
        Sequence.calculateDurationFromNewExtension = function (duration, extension) {
            return (duration * extension) / (duration + extension);
        };
        return Sequence;
    }());
    MML.Sequence = Sequence;
})(MML || (MML = {}));
