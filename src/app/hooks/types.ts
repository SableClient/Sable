import type { IRequestTokenResponse } from '$types/matrix-sdk';

export type RequestEmailTokenResponse = {
  email: string;
  clientSecret: string;
  result: IRequestTokenResponse;
};
export type RequestEmailTokenCallback = (
  email: string,
  clientSecret: string,
  nextLink?: string
) => Promise<RequestEmailTokenResponse>;
