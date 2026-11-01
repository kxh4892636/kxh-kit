export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiFail {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiOk<T> | ApiFail;

export const apiOk = <T>(data: T): ApiOk<T> => ({ ok: true, data });

export const apiFail = (code: string, message: string): ApiFail => ({
  ok: false,
  error: { code, message },
});
