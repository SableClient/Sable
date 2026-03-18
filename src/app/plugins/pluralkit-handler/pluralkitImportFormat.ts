/**
 * the {@link https://pluralkit.me/api/models/#system-model data model for a pluralkit system}
 * @since 1.10.0
 * @author Rye <dev@itsrye.dev>
 */
export type PluralKitSystem = {
  /**
   * id is freeform string
   * @since 1.10.0
   */
  id: string;
  /**
   * uuid of a system
   * @since 1.10.0
   */
  uuid: string;
  name?: string;
  /**
   * description for a system
   * @since 1.10.0
   */
  description?: string;
  /**
   * tag for a system
   * @since 1.10.0
   */
  tag?: string;
  /**
   * the pronouns of a system
   * @since 1.10.0
   */
  pronouns?: string;
  /**
   * Attention this is a http url not a mxc url, you need to consider that.
   * @since 1.10.0
   */
  avatar_url?: string;
  /**
   * this is a http url, so you have to download it and upload it to your homeserver
   * @since 1.10.0
   */
  banner?: string;
  /**
   * The color of a system
   * @since 1.10.0
   */
  color?: string;
  /**
   * Date string in ISO 8601 format, e.g. "2024-01-01T00:00:00Z" (assumingly)
   * @since 1.10.0
   */
  created: string;
};

export type PluralKitProxyTag = {
  prefix?: string;
  suffix?: string;
};

/**
 * the {@link https://pluralkit.me/api/models/#member-model Data model for a system member}
 * @since 1.10.0
 * @author Rye <dev@itsrye.dev>
 */
export type PluralKitMember = {
  /**
   * a freeform id demarking a member of a system
   * @since 1.10.0
   */
  id: string;
  /**
   * uuid of a member
   * @since 1.10.0
   */
  uuid: string;
  /**
   * the name a member of a system uses
   * @since 1.10.0
   */
  name: string;
  /**
   * the display name a member of a system uses
   * @since 1.10.0
   */
  display_name?: string;
  /**
   * the color a member of a system uses
   * @since 1.10.0
   */
  color?: string;
  /**
   * pronouns the member of a system uses
   * @since 1.10.0
   */
  pronouns?: string;
  /**
   * this is a http url, so you have to download it and upload it to your homeserver
   * @since 1.10.0
   */
  avatar_url?: string;
  /**
   * probably won't be really usable in our usecase
   * @since 1.10.0
   */
  webhook_avatar_url?: string;
  /**
   * this is a http url, so you have to download it and upload it to your homeserver
   * @since 1.10.0
   */
  banner?: string;
  /**
   * a description of a member of a system
   * this could be as long as 1000 chars
   * @since 1.10.0
   */
  description?: string;
  /**
   * date when it was created
   * @since 1.10.0
   */
  created: string;
  proxy_tags: Array<PluralKitProxyTag>;
  /**
   * a boolean to denote if it's a sticky proxy
   */
  keep_proxy: boolean;
  autoproxy_enabled?: boolean;
};
