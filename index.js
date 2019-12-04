export const C_BASE_KEY_INDEX = 39; // 0...n
export const C_BASE_NOTE_INDEXES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export const SCALE = 12;
export const TOTAL_NUM_OF_KEYS = 88;
export const A_BASE_KEY_INDEX = 48; // 0...n
export const A_BASE_FREQUENCY = 440;
export const QUARTER_NOTE = 4;
export const BASE_OCTAVE = 4;
export var MML;
(function (MML) {
    let notes;
    let audioContext;
    let gain;
    let filter;
    let scheduleTime = 0.1;
    let lookahead = 25;
    let startTime = 0;
    let sequences = [];
    let playInterval;
    let header;
    MML.initialize = () => {
        const AudioContext = window['AudioContext'] // Default
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
    let calculateNotes = () => {
        notes = [];
        const keys = ['a', 'a+', 'b', 'c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+'];
        const newOctaveIndex = 3;
        let octave = 0;
        let keyIndex = 0;
        for (let n = 0; n < TOTAL_NUM_OF_KEYS; n++) {
            let frequency = Math.pow(2, ((n - A_BASE_KEY_INDEX) / SCALE)) * A_BASE_FREQUENCY;
            let key = keys[keyIndex];
            let nextKey = (keyIndex + 1) % keys.length;
            octave = octave + (keyIndex === newOctaveIndex ? 1 : 0);
            let alt = key.slice(-1) === "#" ? keys[nextKey][0] + '-' : '';
            notes.push({ index: n, key: key, octave: octave, alt: alt, frequency: frequency });
            keyIndex = nextKey;
        }
    };
    MML.getNotes = () => {
        return notes;
    };
    MML.readMML = (mmlString) => {
        const mmls = mmlString.toLowerCase().replace(/\s/g, '').split(';');
        let headerMML = '';
        for (let i = mmls.length - 1; i >= 0; i--) {
            let mml = mmls[i];
            if (mml.includes('%')) {
                headerMML = mmls.splice(i, 1)[0];
                break;
            }
        }
        header = new Sequence(headerMML);
        header.parseMML();
        mmls.map(mml => {
            if (!mml)
                return;
            let sequence = new Sequence(mml);
            sequences.push(sequence);
        });
        sequences.map(sequence => {
            sequence.parseMML();
        });
    };
    MML.writeToMML = () => {
        return (header && header.writeToMML() || '').concat(sequences.map(sequence => {
            return sequence.writeToMML();
        }).join(""));
    };
    MML.playMML = () => {
        if (!startTime) {
            startTime = audioContext.currentTime;
        }
        const relativeScheduleTime = audioContext.currentTime + scheduleTime;
        header && header.playMML(startTime, relativeScheduleTime);
        sequences.map(sequence => {
            sequence.playMML(startTime, relativeScheduleTime);
        });
    };
    MML.stop = () => {
        clearInterval(playInterval);
        gain.disconnect(audioContext.destination);
        startTime = -1;
        header && header.resetPlayState();
        sequences.map(sequence => {
            sequence.resetPlayState();
        });
        MML.initialize();
    };
    MML.play = () => {
        MML.stop();
        playInterval = window.setInterval(MML.playMML, lookahead);
    };
    MML.getDurationFromExtensions = (note) => {
        if (!note.extensions)
            return -1;
        let duration = note.extensions[0];
        note.extensions.slice(1).map(extension => {
            duration = MML.Sequence.calculateDurationFromNewExtension(duration, extension);
        });
        return duration;
    };
    // 1bpm = 1s -> 1beat= 1/60s, 1beat = 4 defaultDuration
    MML.convertDurationToSeconds = (note, tempo) => {
        let duration = MML.getDurationFromExtensions(note);
        if (duration === 0 || tempo === 0) {
            return Number.MAX_VALUE;
        }
        return (QUARTER_NOTE / duration) * 60 / tempo;
    };
    MML.playNote = (note, tempo, scheduledStartTime) => {
        if (!scheduledStartTime)
            scheduledStartTime = audioContext.currentTime;
        let oscillators = [];
        let numberOfOscillators = 2;
        for (let i = 0; i < numberOfOscillators; i++) {
            const osc = audioContext.createOscillator();
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
    MML.getHeaderNotesInQueue = () => {
        return header && header.notesInQueue;
    };
    MML.getNotesInQueue = () => {
        return sequences.map(sequence => {
            return sequence.notesInQueue;
        });
    };
    class Sequence {
        constructor(mml) {
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
            this.playState = {};
            this.resetPlayState = () => {
                this.playState = {
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
            this.expect = (reg) => {
                if (!reg.test(this.mml[this.mmlIndex])) {
                    throw new Error('Invalid MML syntax.\n' +
                        'Expected: ' + reg + ', Got: ' + this.mml[this.mmlIndex]);
                }
            };
            this.isThisValid = (reg) => {
                return this.goToNext = !!this.mml[this.mmlIndex] && !!this.mml[this.mmlIndex].trim() && reg.test(this.mml[this.mmlIndex]);
            };
            this.isNextValid = (reg) => {
                this.mmlIndex++;
                return this.isThisValid(reg);
            };
            this.getOctaveOffset = () => {
                return (this.octave - BASE_OCTAVE) * SCALE;
            };
            this.readNextLength = () => {
                let length = 0;
                do {
                    if (this.isThisValid(/\d/)) {
                        length = length * 10 + parseInt(this.mml[this.mmlIndex]);
                    }
                } while (this.isNextValid(/\d/));
                return length !== 0 ? [length] : this.defaultExtensions;
            };
            this.getDuration = () => {
                this.expect(/[\dl^.~]/);
                this.extensions = this.defaultExtensions;
                let changeDefaultDuration = false;
                while (this.isThisValid(/[\dl^.~]/)) {
                    switch (this.mml[this.mmlIndex]) {
                        case 'l':
                            changeDefaultDuration = true;
                            this.extensions = this.readNextLength();
                            break;
                        case '^':
                            this.extensions = this.extensions.concat(this.readNextLength());
                            break;
                        case '.':
                            do {
                                let extension = this.extensions[this.extensions.length - 1] * 2;
                                this.extensions.push(extension);
                            } while (this.isNextValid(/\./));
                            break;
                        case '~':
                            this.extensions = this.extensions.concat(...new Array(this.readNextLength()[0]).fill(this.extensions[0]));
                            break;
                        default: {
                            this.extensions = this.readNextLength();
                            break;
                        }
                    }
                }
                if (changeDefaultDuration) {
                    this.defaultExtensions = this.extensions;
                    this.notesInQueue.push({
                        type: "default-duration",
                        extensions: this.defaultExtensions
                    });
                }
            };
            this.saveNote = (noteIndex) => {
                this.notesInQueue.push({
                    type: 'note',
                    index: noteIndex,
                    extensions: this.extensions,
                });
            };
            this.nextNote = () => {
                this.extensions = this.defaultExtensions;
            };
            this.getNote = () => {
                this.expect(/[cdefgab]/);
                let noteIndex = C_BASE_NOTE_INDEXES[this.mml[this.mmlIndex]] + C_BASE_KEY_INDEX + this.getOctaveOffset();
                if (this.isNextValid(/[-+#\d^.]/)) {
                    switch (this.mml[this.mmlIndex]) {
                        case '-':
                            noteIndex--;
                            break;
                        case '+':
                        case '#':
                            noteIndex++;
                            break;
                        default:
                            if (this.readingChord) {
                                break;
                            }
                            this.getDuration();
                            break;
                    }
                }
                if (this.readingChord) {
                    this.chordNoteIndexes.push(noteIndex);
                    return;
                }
                this.saveNote(noteIndex);
            };
            this.getOctave = () => {
                this.expect(/o/);
                if (this.isNextValid(/\d/)) {
                    this.octave = parseInt(this.mml[this.mmlIndex]);
                    this.notesInQueue.push({ type: "octave", octave: this.octave });
                }
            };
            this.decreaseOctave = () => {
                this.expect(/>/);
                if (this.isNextValid(/\d/)) {
                    this.octave -= parseInt(this.mml[this.mmlIndex]);
                }
                else {
                    this.octave--;
                }
                this.notesInQueue.push({ type: "octave", octave: this.octave });
            };
            this.increaseOctave = () => {
                this.expect(/</);
                if (this.isNextValid(/\d/)) {
                    this.octave += parseInt(this.mml[this.mmlIndex]);
                }
                else {
                    this.octave++;
                }
                this.notesInQueue.push({ type: "octave", octave: this.octave });
            };
            this.getTempo = () => {
                this.expect(/t/);
                let newTempo = 0;
                while (this.isNextValid(/\d/)) {
                    newTempo = newTempo * 10 + parseInt(this.mml[this.mmlIndex]);
                }
                this.tempo = newTempo;
                this.notesInQueue.push({ type: "tempo", tempo: this.tempo });
            };
            this.getRest = () => {
                this.expect(/r/);
                if (this.isNextValid(/[\d^.]/)) {
                    this.getDuration();
                }
                this.notesInQueue.push({
                    type: 'rest',
                    extensions: this.extensions,
                });
            };
            this.getChord = () => {
                this.expect(/\[/);
                this.readingChord = true;
                this.chordNoteIndexes = [];
                this.notesInQueue.push({ type: 'start-chord' });
            };
            this.playChord = () => {
                this.expect(/]/);
                if (this.isNextValid(/[\d^.]/)) {
                    this.getDuration();
                }
                this.chordNoteIndexes.map(noteIndex => {
                    this.saveNote(noteIndex);
                });
                this.readingChord = false;
                this.chordNoteIndexes = [];
                this.notesInQueue.push({
                    type: 'end-chord',
                    extensions: this.extensions,
                });
            };
            this.setInfiniteLoop = () => {
                this.expect(/$/);
                this.mmlIndex++;
                this.notesInQueue.push({ type: 'infinite-loop' });
            };
            this.startLoop = () => {
                this.expect(/\//);
                this.mmlIndex++;
                this.expect(/:/);
                this.mmlIndex++;
                this.notesInQueue.push({ type: 'start-loop' });
            };
            this.endLoop = () => {
                this.expect(/:/);
                this.mmlIndex++;
                this.expect(/\//);
                let loopTimes = 0;
                while (this.isNextValid(/\d/)) {
                    loopTimes = loopTimes * 10 + parseInt(this.mml[this.mmlIndex]);
                }
                if (loopTimes === 0) {
                    loopTimes = 2;
                }
                this.notesInQueue.push({ type: 'end-loop', times: loopTimes });
            };
            this.breakLoop = () => {
                this.expect(/\|/);
                this.notesInQueue.push({ type: 'break-loop' });
            };
            this.setHeader = () => {
                this.expect(/%/);
                this.notesInQueue.push({ type: 'header' });
                this.isHeader = true;
            };
            this.parseMML = () => {
                while (this.mmlIndex < this.mml.length) {
                    const prevMMLIndex = this.mmlIndex;
                    this.nextNote();
                    switch (this.mml[this.mmlIndex]) {
                        case 'c':
                        case 'd':
                        case 'e':
                        case 'f':
                        case 'g':
                        case 'a':
                        case 'b':
                            this.getNote();
                            break;
                        case '[':
                            this.getChord();
                            break;
                        case ']':
                            this.playChord();
                            break;
                        case 'r':
                            this.getRest();
                            break;
                        case 'l':
                            this.getDuration();
                            break;
                        case 'o':
                            this.getOctave();
                            break;
                        case '>':
                            this.decreaseOctave();
                            break;
                        case '<':
                            this.increaseOctave();
                            break;
                        case 't':
                            this.getTempo();
                            break;
                        case '$':
                            this.setInfiniteLoop();
                            break;
                        case '/':
                            this.startLoop();
                            break;
                        case ':':
                            this.endLoop();
                            break;
                        case '|':
                            this.breakLoop();
                            break;
                        case '%':
                            this.setHeader();
                            break;
                        default:
                            this.goToNext = true;
                            break;
                    }
                    if (this.goToNext || prevMMLIndex === this.mmlIndex) {
                        this.mmlIndex++;
                        this.goToNext = false;
                    }
                }
            };
            this.playMML = (relativeStartTime, relativeScheduleTime) => {
                while (this.playState.nextNoteTime < relativeScheduleTime
                    && (this.isHeader || !header || this.playState.nextNoteTime < header.playState.nextNoteTime)
                    && this.playState.index < this.notesInQueue.length) {
                    if (!this.isHeader && header) {
                        this.playState.tempo = header.tempo;
                        if (header.playState.startLoopIndex >= 0 && this.playState.startLoopIndex < 0) {
                            this.playState.startLoopIndex = this.playState.index;
                            this.playState.startLoopOffset = header.playState.loopNoteTime - this.playState.nextNoteTime;
                            if (this.playState.startLoopOffset < 0)
                                this.playState.startLoopOffset = 0;
                        }
                        else if (header.playState.endLoopIndex >= 0 && this.playState.endLoopIndex < 0) {
                            this.playState.endLoopIndex = this.playState.index;
                            this.playState.endLoopOffset = header.playState.loopNoteTime - this.playState.nextNoteTime;
                            if (this.playState.endLoopOffset < 0)
                                this.playState.endLoopOffset = 0;
                            this.playState.loopCount = header.playState.loopCount;
                            this.playState.index = this.playState.startLoopIndex;
                            this.playState.nextNoteTime += this.playState.startLoopOffset;
                        }
                        else if (header.playState.loopCount !== this.playState.loopCount) {
                            if (header.playState.loopCount < 0) {
                                this.playState.index = this.playState.endLoopIndex;
                                this.playState.nextNoteTime += this.playState.endLoopOffset;
                                this.playState.loopCount = -1;
                                this.playState.startLoopIndex = -1;
                                this.playState.endLoopIndex = -1;
                            }
                            else {
                                this.playState.index = this.playState.startLoopIndex;
                                this.playState.nextNoteTime += this.playState.startLoopOffset;
                                this.playState.loopCount = header.playState.loopCount;
                            }
                        }
                    }
                    let prevPlayState = this.playState;
                    this.playState = Object.assign({}, this.playState);
                    const note = this.notesInQueue[this.playState.index];
                    switch (note.type) {
                        case 'start-loop':
                            this.playState.startLoopIndex = this.playState.index;
                            this.playState.loopNoteTime = this.playState.nextNoteTime;
                            break;
                        case 'end-loop':
                            if (this.playState.loopCount < 0) {
                                this.playState.endLoopIndex = this.playState.index;
                                this.playState.loopCount = note.times;
                                this.playState.loopNoteTime = this.playState.nextNoteTime;
                            }
                            this.playState.loopCount--;
                            if (this.playState.loopCount > 0) {
                                this.playState.index = this.playState.startLoopIndex;
                            }
                            else {
                                this.playState.loopCount = -1;
                                this.playState.startLoopIndex = -1;
                                this.playState.endLoopIndex = -1;
                            }
                            break;
                        case 'break-loop':
                            if (this.playState.loopCount === 1) {
                                this.playState.index = this.playState.endLoopIndex;
                                this.playState.loopCount = -1;
                                this.playState.startLoopIndex = -1;
                                this.playState.endLoopIndex = -1;
                            }
                            break;
                        case 'infinite-loop':
                            this.playState.infiniteLoopIndex = this.playState.index;
                            break;
                        case 'tempo':
                            this.playState.tempo = note.tempo;
                            break;
                        case 'start-chord':
                            this.playState.chord = true;
                            break;
                        case 'end-chord':
                            this.playState.chord = false;
                            this.playState.nextNoteTime += MML.convertDurationToSeconds(note, this.playState.tempo);
                            break;
                        case 'rest':
                            this.playState.nextNoteTime += MML.convertDurationToSeconds(note, this.playState.tempo);
                            break;
                        case 'note':
                            MML.playNote(note, this.playState.tempo, relativeStartTime + this.playState.nextNoteTime);
                            if (this.playState.chord)
                                break;
                            this.playState.nextNoteTime += MML.convertDurationToSeconds(note, this.playState.tempo);
                            break;
                    }
                    if (this.playState.infiniteLoopIndex >= 0 && this.playState.index >= this.notesInQueue.length - 1) {
                        this.playState.index = this.playState.infiniteLoopIndex;
                    }
                    this.playState.index++;
                    if (this.isHeader && prevPlayState.nextNoteTime !== this.playState.nextNoteTime)
                        break;
                }
            };
            this.stringifyNoteKey = (note) => {
                return notes[note.index].key;
            };
            this.stringifyNoteDuration = (note, defaultExtension) => {
                let mmlDuration = "";
                let prevExtension = note.extensions[0];
                let occurrences = 1;
                mmlDuration += note.extensions.join('') === defaultExtension.join('') ? "" : prevExtension;
                note.extensions.slice(1).map((extension) => {
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
            this.writeToMML = () => {
                let mmlText = "";
                let defaultExtensions = [QUARTER_NOTE];
                this.notesInQueue.map(note => {
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
                            mmlText += "l" + this.stringifyNoteDuration(note, []);
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
                            mmlText += "]" + this.stringifyNoteDuration(note, defaultExtensions);
                            break;
                        case "rest":
                            mmlText += "r" + this.stringifyNoteDuration(note, defaultExtensions);
                            break;
                        case "note":
                            mmlText += this.stringifyNoteKey(note) + this.stringifyNoteDuration(note, defaultExtensions);
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
    }
    Sequence.calculateDurationFromNewExtension = (duration, extension) => {
        return (duration * extension) / (duration + extension);
    };
    MML.Sequence = Sequence;
})(MML || (MML = {}));
