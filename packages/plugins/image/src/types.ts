export interface CreateImageResponse {
  status: string;
  fileName: string;
  imageUrl: string;
}

export interface CreateImageParams {
  prompt: string;
  image_url?: string;
}

export interface IImageProvider {
  getName(): string;
  createImage(params: CreateImageParams): Promise<CreateImageResponse>;
}
