import { MatrixClient, Room } from 'matrix-js-sdk';

export type CommandExecutionContext = {
  mx: MatrixClient;
  room: Room;
};

export type GenericCommandExecutionArgContainerConstructorParams = {
  desc?: string;

  val: any;

  type?: string;

  format?: string;

  required: boolean;
};

export class GenericCommandExecutionArgContainer {
  desc?: string;

  val: any;

  type?: string;

  format?: string;

  required: boolean;

  constructor(params: GenericCommandExecutionArgContainerConstructorParams) {
    this.desc = params.desc;
    this.val = params.val;
    this.format = params.format;
    this.required = params.required;
  }
}
