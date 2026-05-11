/**
 * a simple wrapper to make a set seriazable to json
 *
 * @export
 * @class SerializableSet
 * @extends {Set<ItemType>}
 * @template ItemType the type of the items in the set
 */
export class SerializableSet<ItemType> extends Set<ItemType> {
  toJSON() {
    return Array.from(this);
  }
}
