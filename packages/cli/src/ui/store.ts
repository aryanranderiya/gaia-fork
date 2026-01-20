import { EventEmitter } from 'events';

export type CLIState = {
  step: string;
  status: string;
  error: Error | null;
  data: Record<string, any>;
  inputRequest: { id: string; meta?: any } | null;
};

export class CLIStore extends EventEmitter {
  private state: CLIState = {
    step: 'init',
    status: '',
    error: null,
    data: {},
    inputRequest: null,
  };
  private inputResolver: ((value: any) => void) | null = null;

  constructor() {
    super();
  }

  get currentState() {
    return this.state;
  }

  setStep(step: string) {
    this.state.step = step;
    this.emit('change', this.state);
  }

  setStatus(status: string) {
    this.state.status = status;
    this.emit('change', this.state);
  }

  setError(error: Error | null) {
    this.state.error = error;
    this.emit('change', this.state);
  }

  updateData(key: string, value: any) {
    this.state.data = { ...this.state.data, [key]: value };
    this.emit('change', this.state);
  }

  waitForInput(id: string, meta?: any): Promise<any> {
    this.state.inputRequest = { id, meta };
    this.emit('change', this.state);
    return new Promise((resolve) => {
        this.inputResolver = resolve;
    });
  }

  submitInput(value: any) {
    if (this.inputResolver) {
        this.inputResolver(value);
        this.inputResolver = null;
        this.state.inputRequest = null;
        this.emit('change', this.state);
    }
  }

  // Helper for emitting specific events if needed, but 'change' covers mostly everything for React
  emitChange() {
    this.emit('change', this.state);
  }
}

export const createStore = () => new CLIStore();
