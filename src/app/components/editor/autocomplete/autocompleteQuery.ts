export enum AutocompletePrefix {
  RoomMention = '#',
  UserMention = '@',
  Emoticon = ':',
  Command = '/',
  Reaction = '+:',
}

export const ANYWHERE_AUTOCOMPLETE_PREFIXES: readonly AutocompletePrefix[] = [
  AutocompletePrefix.RoomMention,
  AutocompletePrefix.UserMention,
  AutocompletePrefix.Emoticon,
];

export const BEGINNING_AUTOCOMPLETE_PREFIXES: readonly AutocompletePrefix[] = [
  AutocompletePrefix.Command,
  AutocompletePrefix.Reaction,
];
