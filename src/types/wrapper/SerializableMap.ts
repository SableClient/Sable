/**
 * a simple wrapper to make a map seriazable to json
 *
 * @export
 * @class SerializableMap
 * @extends {Map<KeyType, ItemType>}
 * @template KeyType the type of the key
 * @template ItemType the type of the item
 */
export class SerializableMap<KeyType, ItemType> extends Map<KeyType, ItemType> {
  toJSON() {
    return Object.fromEntries(this);
  }
}
