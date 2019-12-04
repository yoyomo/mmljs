export declare const C_BASE_KEY_INDEX = 39;
export declare const C_BASE_NOTE_INDEXES: {
    c: number;
    d: number;
    e: number;
    f: number;
    g: number;
    a: number;
    b: number;
};
export declare const SCALE = 12;
export declare const TOTAL_NUM_OF_KEYS = 88;
export declare const A_BASE_KEY_INDEX = 48;
export declare const A_BASE_FREQUENCY = 440;
export declare const QUARTER_NOTE = 4;
export declare const BASE_OCTAVE = 4;
export interface Note {
    type: 'note';
    index: number;
    extensions: number[];
}
export interface StartChord {
    type: 'start-chord';
}
export interface EndChord {
    type: 'end-chord';
    extensions: number[];
}
export interface Rest {
    type: 'rest';
    extensions: number[];
}
export interface StartLoop {
    type: 'start-loop';
}
export interface BreakLoop {
    type: 'break-loop';
}
export interface EndLoop {
    type: 'end-loop';
    times: number;
}
export interface InfiniteLoop {
    type: 'infinite-loop';
}
export interface Tempo {
    type: 'tempo';
    tempo: number;
}
export interface Octave {
    type: 'octave';
    octave: number;
}
export interface DefaultDuration {
    type: 'default-duration';
    extensions: number[];
}
export interface Header {
    type: 'header';
}
export declare type TimedSequenceNote = Note | EndChord | Rest | DefaultDuration;
export declare type SequenceNote = Note | StartLoop | BreakLoop | EndLoop | InfiniteLoop | StartChord | EndChord | Rest | Octave | Tempo | DefaultDuration | Header;
export interface PlayState {
    index: number;
    nextNoteTime: number;
    chord: boolean;
    tempo: number;
    startLoopIndex: number;
    loopCount: number;
    endLoopIndex: number;
    infiniteLoopIndex: number;
    loopNoteTime: number;
    startLoopOffset: number;
    endLoopOffset: number;
}
export interface NotesInterface {
    index: number;
    key: string;
    octave: number;
    alt: string;
    frequency: number;
}
export declare module MML {
    const initialize: () => void;
    const getNotes: () => NotesInterface[];
    const readMML: (mmlString: string) => void;
    const writeToMML: () => string;
    const playMML: () => void;
    const stop: () => void;
    const play: () => void;
    const getDurationFromExtensions: (note: TimedSequenceNote) => number;
    const convertDurationToSeconds: (note: TimedSequenceNote, tempo: number) => number;
    const playNote: (note: Note, tempo: number, scheduledStartTime: number) => OscillatorNode[];
    const getHeaderNotesInQueue: () => SequenceNote[];
    const getNotesInQueue: () => SequenceNote[][];
    class Sequence {
        tempo: number;
        octave: number;
        extensions: number[];
        defaultExtensions: number[];
        chordNoteIndexes: any[];
        readingChord: boolean;
        mmlIndex: number;
        mml: string;
        goToNext: boolean;
        isHeader: boolean;
        notesInQueue: SequenceNote[];
        playState: PlayState;
        constructor(mml: string);
        resetPlayState: () => void;
        expect: (reg: RegExp) => void;
        isThisValid: (reg: RegExp) => boolean;
        isNextValid: (reg: RegExp) => boolean;
        getOctaveOffset: () => number;
        static calculateDurationFromNewExtension: (duration: number, extension: number) => number;
        readNextLength: () => any[];
        getDuration: () => void;
        saveNote: (noteIndex: number) => void;
        nextNote: () => void;
        getNote: () => void;
        getOctave: () => void;
        decreaseOctave: () => void;
        increaseOctave: () => void;
        getTempo: () => void;
        getRest: () => void;
        getChord: () => void;
        playChord: () => void;
        setInfiniteLoop: () => void;
        startLoop: () => void;
        endLoop: () => void;
        breakLoop: () => void;
        setHeader: () => void;
        parseMML: () => void;
        playMML: (relativeStartTime: number, relativeScheduleTime: number) => void;
        stringifyNoteKey: (note: Note) => string;
        stringifyNoteDuration: (note: TimedSequenceNote, defaultExtension: number[]) => string;
        writeToMML: () => string;
    }
}
