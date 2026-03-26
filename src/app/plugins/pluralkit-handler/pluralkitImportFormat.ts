/**
 * the {@link https://pluralkit.me/api/models/#system-model data model for a pluralkit system}
 * @author Rye <dev@itsrye.dev>
 */
export type PluralKitSystem = {
  /**
   * id is freeform string
   */
  id: string;
  /**
   * uuid of a system
   */
  uuid: string;
  name?: string;
  /**
   * description for a system
   */
  description?: string;
  /**
   * tag for a system
   */
  tag?: string;
  /**
   * the pronouns of a system
   */
  pronouns?: string;
  /**
   * Attention this is a http url not a mxc url, you need to consider that.
   */
  avatar_url?: string;
  /**
   * this is a http url, so you have to download it and upload it to your homeserver
   */
  banner?: string;
  /**
   * The color of a system
   */
  color?: string;
  /**
   * Date string in ISO 8601 format, e.g. "2024-01-01T00:00:00Z" (assumingly)
   */
  created: string;
};

export type PluralKitProxyTag = {
  prefix?: string;
  suffix?: string;
};

/**
 * the {@link https://pluralkit.me/api/models/#member-model Data model for a system member}
 * @author Rye <dev@itsrye.dev>
 */
export type PluralKitMember = {
  /**
   * a freeform id demarking a member of a system
   */
  id: string;
  /**
   * uuid of a member
   */
  uuid: string;
  /**
   * the name a member of a system uses
   */
  name: string;
  /**
   * the display name a member of a system uses
   */
  display_name?: string;
  /**
   * the color a member of a system uses
   */
  color?: string;
  /**
   * pronouns the member of a system uses
   */
  pronouns?: string;
  /**
   * this is a http url, so you have to download it and upload it to your homeserver
   */
  avatar_url?: string;
  /**
   * probably won't be really usable in our usecase
   */
  webhook_avatar_url?: string;
  /**
   * this is a http url, so you have to download it and upload it to your homeserver
   */
  banner?: string;
  /**
   * a description of a member of a system
   * this could be as long as 1000 chars
   */
  description?: string;
  /**
   * date when it was created
   */
  created: string;
  proxy_tags: Array<PluralKitProxyTag>;
  /**
   * a boolean to denote if it's a sticky proxy
   */
  keep_proxy: boolean;
  autoproxy_enabled?: boolean;
};
