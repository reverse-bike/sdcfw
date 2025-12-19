// Browser polyfill for Node.js 'events' module
import EventEmitter3 from 'eventemitter3';

// Re-export EventEmitter3 as EventEmitter for compatibility with Node.js code
export const EventEmitter = EventEmitter3;
export { EventEmitter3 };
export default EventEmitter3;
