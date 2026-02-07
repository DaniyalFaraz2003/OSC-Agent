import { EventEmitter } from 'events';
import { Trigger } from './transitions';
import { State } from './states';

export interface StateChangeEvent {
  from: State;
  to: State;
  trigger: Trigger;
  runId: string;
  timestamp: string;
}

export class StateMachineEvents extends EventEmitter {
  emitTransition(event: StateChangeEvent): void {
    this.emit('stateChange', event);
  }
}
