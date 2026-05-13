import React from 'react';
import { generateShortId } from '$utils/shortIdGen';
import { AbstractCommand } from './AbstractCommand';
import * as css from './slateInput.css';

type InputElementForParams = {
  attributeType?: string;
  helpText?: string;
  placeHolder?: string;
  required: boolean;
  pattern?: string;
  id?: string;
  name?: string;
  onChange: (val: any) => void;
};

function InputElementFor({
  attributeType,
  helpText,
  placeHolder,
  onChange,
  pattern,
  required = false,
  id,
  name,
}: Readonly<InputElementForParams>) {
  if (attributeType === undefined || attributeType === 'string') {
    return (
      <input
        type="text"
        title={helpText}
        placeholder={placeHolder}
        required={required}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          onChange(e.target.value);
        }}
        id={id}
        name={name}
      />
    );
  }
  if (attributeType === 'custom') {
    return (
      <input
        type="text"
        title={helpText}
        placeholder={placeHolder}
        required={required}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          onChange(e.target.value);
        }}
        pattern={pattern}
        id={id}
        name={name}
      />
    );
  }
  if (attributeType === 'color') {
    return (
      <input
        type="color"
        title={helpText}
        placeholder={placeHolder}
        required={required}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          onChange(e.target.value);
        }}
        id={id}
        name={name}
      />
    );
  }
  if (attributeType === 'boolean') {
    return (
      <select
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
          onChange(e.target.selectedOptions[0].value === 'true');
        }}
        required={required}
        id={id}
        name={name}
      >
        <option value="false" id={`${id}-false`}>
          false
        </option>
        <option value="true" id={`${id}-true`}>
          true
        </option>
      </select>
    );
  }
}

type SlateInputForCommandProps = {
  command: AbstractCommand;
  commandNameClassName: string;
};

export function SlateInputForCommand({
  command,
  commandNameClassName,
}: Readonly<SlateInputForCommandProps>) {
  return (
    <span className={css.CommandInline} contentEditable={false}>
      <strong className={commandNameClassName} title={command.getCommandDefinition().description}>
        {`/${command.getCommandDefinition().id}`}
      </strong>
      {command.getCommandDefinition().attributes?.map((attr) => (
        <span className={css.CommandAttribute} key={attr.id}>
          <span className={css.CommandAttributeLabel}>{attr.id}</span>
          <InputElementFor
            attributeType={attr.type}
            helpText={attr.description}
            placeHolder={attr.exampleValue}
            onChange={(value) => {
              if (value === null || value === undefined || value === '') return;
              command.updateArgValue(attr.id, value);
            }}
            required={attr.required}
            pattern={attr.format}
            id={generateShortId(5)}
            name={generateShortId(5)}
          />
        </span>
      ))}
    </span>
  );
}
