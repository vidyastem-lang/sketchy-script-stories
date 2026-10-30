import "@lovable.dev/ai-gateway";

/* The MIT License

Copyright (c) OpenAI (https://openai.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
 */
declare namespace ModelContract_22a58a07375a37a1 {
export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        GatewayErrorResponse: {
            error: {
                code?: string | null;
                message: string;
                metadata?: {
                    provider_name?: unknown;
                    raw?: unknown;
                };
                param?: unknown;
                type?: string;
            };
            usage?: {
                [key: string]: unknown;
            };
        };
        GatewayImageError: {
            error: {
                code?: string | null;
                message: string;
                metadata?: {
                    provider_name?: unknown;
                    raw?: unknown;
                };
                param?: unknown;
                type?: string;
            };
            
            type: "error";
        };
        ImageEditEvent: components["schemas"]["Output_ImageEditStreamEvent"] | components["schemas"]["GatewayErrorResponse"] | components["schemas"]["GatewayImageError"];
        ImageEditRequest: {
            background?: ("transparent" | "opaque" | "auto") | null;
            image: Blob | Blob[];
            
            mask?: Blob;
            
            model: "openai/gpt-image-2.5-sunburst";
            n?: number | null;
            output_compression?: number | null;
            output_format?: ("png" | "jpeg" | "webp") | null;
            partial_images?: components["schemas"]["PartialImages"];
            prompt: string;
            quality?: ("low" | "medium" | "high" | "xhigh" | "max" | "auto") | null;
            size?: (string | ("1024x1024" | "1536x1024" | "1024x1536" | "auto" | "256x256" | "512x512")) | null;
            stream?: boolean | null;
            user?: string;
        };
        ImageEditResponse: components["schemas"]["Output_ImagesResponse"];
        ImageGenerationEvent: components["schemas"]["Output_ImageGenStreamEvent"] | components["schemas"]["GatewayErrorResponse"] | components["schemas"]["GatewayImageError"];
        ImageGenerationRequest: {
            background?: ("transparent" | "opaque" | "auto") | null;
            
            model: "openai/gpt-image-2.5-sunburst";
            moderation?: ("low" | "auto") | null;
            n?: number | null;
            output_compression?: number | null;
            output_format?: ("png" | "jpeg" | "webp") | null;
            partial_images?: components["schemas"]["PartialImages"];
            prompt: string;
            quality?: ("low" | "medium" | "high" | "xhigh" | "max" | "auto") | null;
            size?: (string | ("auto" | "1024x1024" | "1536x1024" | "1024x1536" | "256x256" | "512x512" | "1792x1024" | "1024x1792")) | null;
            stream?: boolean | null;
            user?: string;
        };
        ImageGenerationResponse: components["schemas"]["Output_ImagesResponse"];
        Output_Image: {
            b64_json?: string;
            revised_prompt?: string;
            
            url?: string;
        };
        Output_ImageEditCompletedEvent: {
            b64_json: string;
            
            background: "transparent" | "opaque" | "auto";
            
            created_at: number;
            
            output_format: "png" | "webp" | "jpeg";
            
            quality: "low" | "medium" | "high" | "xhigh" | "max" | "auto";
            size: string | ("1024x1024" | "1024x1536" | "1536x1024" | "auto");
            
            type: "image_edit.completed";
            usage: components["schemas"]["Output_ImagesUsage"];
        };
        Output_ImageEditPartialImageEvent: {
            b64_json: string;
            
            background: "transparent" | "opaque" | "auto";
            
            created_at: number;
            
            output_format: "png" | "webp" | "jpeg";
            partial_image_index: number;
            
            quality: "low" | "medium" | "high" | "xhigh" | "max" | "auto";
            size: string | ("1024x1024" | "1024x1536" | "1536x1024" | "auto");
            
            type: "image_edit.partial_image";
        };
        Output_ImageEditStreamEvent: components["schemas"]["Output_ImageEditPartialImageEvent"] | components["schemas"]["Output_ImageEditCompletedEvent"];
        Output_ImageGenCompletedEvent: {
            b64_json: string;
            
            background: "transparent" | "opaque" | "auto";
            
            created_at: number;
            
            output_format: "png" | "webp" | "jpeg";
            
            quality: "low" | "medium" | "high" | "xhigh" | "max" | "auto";
            size: string | ("1024x1024" | "1024x1536" | "1536x1024" | "auto");
            
            type: "image_generation.completed";
            usage: components["schemas"]["Output_ImagesUsage"];
        };
        Output_ImageGenInputUsageDetails: {
            image_tokens: number;
            text_tokens: number;
        };
        Output_ImageGenOutputTokensDetails: {
            image_tokens: number;
            text_tokens: number;
        };
        Output_ImageGenPartialImageEvent: {
            b64_json: string;
            
            background: "transparent" | "opaque" | "auto";
            
            created_at: number;
            
            output_format: "png" | "webp" | "jpeg";
            partial_image_index: number;
            
            quality: "low" | "medium" | "high" | "xhigh" | "max" | "auto";
            size: string | ("1024x1024" | "1024x1536" | "1536x1024" | "auto");
            
            type: "image_generation.partial_image";
        };
        Output_ImageGenStreamEvent: components["schemas"]["Output_ImageGenPartialImageEvent"] | components["schemas"]["Output_ImageGenCompletedEvent"];
        Output_ImageGenUsage: {
            input_tokens: number;
            input_tokens_details: components["schemas"]["Output_ImageGenInputUsageDetails"];
            output_tokens: number;
            output_tokens_details?: components["schemas"]["Output_ImageGenOutputTokensDetails"];
            total_tokens: number;
        };
        Output_ImagesResponse: {
            
            background?: "transparent" | "opaque";
            
            created: number;
            data?: components["schemas"]["Output_Image"][];
            
            output_format?: "png" | "webp" | "jpeg";
            
            quality?: "low" | "medium" | "high" | "xhigh" | "max";
            size?: string | ("1024x1024" | "1024x1536" | "1536x1024");
            usage?: components["schemas"]["Output_ImageGenUsage"];
        };
        Output_ImagesUsage: {
            input_tokens: number;
            input_tokens_details: {
                image_tokens: number;
                text_tokens: number;
            };
            output_tokens: number;
            total_tokens: number;
        };
        PartialImages: number | null;
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;

}
declare namespace ModelContract_3c51f8f48d09c1e0 {
export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        
        AudioResponse: Blob;
        Input_AllowedToolsParam: {
            mode?: ("auto" | "any" | "none" | "validated") | string;
            tools?: string[];
        };
        Input_AnnotationParam: components["schemas"]["Input_SpeechAnnotationParam"] | components["schemas"]["Input_URLCitationParam"] | components["schemas"]["Input_PlaceCitationParam"] | components["schemas"]["Input_WordInfoParam"] | components["schemas"]["Input_FileCitationParam"];
        Input_AudioContentParam: {
            channels?: number;
            data: string;
            mime_type?: ("audio/wav" | "audio/mp3" | "audio/aiff" | "audio/aac" | "audio/ogg" | "audio/flac" | "audio/mpeg" | "audio/m4a" | "audio/l16" | "audio/opus" | "audio/alaw" | "audio/mulaw" | "audio/webm") | string;
            sample_rate?: number;
            
            type: "audio";
        };
        Input_AudioResponseFormatParam: {
            bit_rate?: number;
            delivery?: ("inline" | "uri") | string;
            mime_type?: ("audio/mp3" | "audio/ogg_opus" | "audio/l16" | "audio/wav" | "audio/alaw" | "audio/mulaw") | string;
            sample_rate?: number;
            
            type: "audio";
        };
        Input_ContentParam: components["schemas"]["Input_TextContentParam"] | components["schemas"]["Input_DocumentContentParam"] | components["schemas"]["Input_ImageContentParam"] | components["schemas"]["Input_AudioContentParam"] | components["schemas"]["Input_VideoContentParam"];
        Input_CreateModelInteractionResponseFormatParam: components["schemas"]["Input_ResponseFormatParam"] | components["schemas"]["Input_ResponseFormatParam"][];
        Input_DocumentContentParam: {
            data: string;
            mime_type?: ("application/pdf" | "text/csv") | string;
            
            type: "document";
        };
        Input_FileCitationParam: {
            custom_metadata?: {
                [key: string]: unknown;
            };
            document_uri?: string;
            end_index?: number;
            file_name?: string;
            media_id?: string;
            page_number?: number;
            source?: string;
            start_index?: number;
            
            type: "file_citation";
        };
        Input_GenerationConfigParam: {
            image_config?: components["schemas"]["Input_ImageConfigParam"];
            max_output_tokens?: number;
            seed?: number;
            speech_config?: components["schemas"]["Input_SpeechConfigUnionParam"];
            stop_sequences?: string[];
            temperature?: number;
            thinking_level?: ("minimal" | "low" | "medium" | "high") | string;
            thinking_summaries?: ("auto" | "none") | string;
            tool_choice?: components["schemas"]["Input_ToolChoiceParam"];
            top_p?: number;
            transcription_config?: components["schemas"]["Input_TranscriptionConfigParam"];
            video_config?: components["schemas"]["Input_VideoConfigParam"];
        };
        Input_ImageConfigParam: {
            aspect_ratio?: ("1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9" | "1:8" | "8:1" | "1:4" | "4:1") | string;
            image_size?: ("1K" | "2K" | "4K" | "512") | string;
        };
        Input_ImageContentParam: {
            data: string;
            mime_type?: ("image/png" | "image/jpeg" | "image/webp" | "image/heic" | "image/heif" | "image/gif" | "image/bmp" | "image/tiff") | string;
            resolution?: ("low" | "medium" | "high" | "ultra_high") | string;
            
            type: "image";
        };
        Input_ImageResponseFormatParam: {
            aspect_ratio?: ("1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9" | "1:8" | "8:1" | "1:4" | "4:1") | string;
            delivery?: ("inline" | "uri") | string;
            image_size?: ("1K" | "2K" | "4K" | "512") | string;
            
            mime_type?: "image/jpeg";
            
            type: "image";
        };
        Input_PlaceCitationParam: {
            end_index?: number;
            name?: string;
            place_id?: string;
            review_snippets?: components["schemas"]["Input_ReviewSnippetParam"][];
            start_index?: number;
            
            type: "place_citation";
            url?: string;
        };
        Input_ProcessingParam: components["schemas"]["Input_StaticMediaProcessingParam"] | ("static" | "agentic") | string;
        Input_ResponseFormatParam: components["schemas"]["Input_TextResponseFormatParam"] | components["schemas"]["Input_AudioResponseFormatParam"] | components["schemas"]["Input_ImageResponseFormatParam"] | components["schemas"]["Input_VideoResponseFormatParam"] | {
            [key: string]: unknown;
        };
        Input_ReviewSnippetParam: {
            review_id?: string;
            title?: string;
            url?: string;
        };
        Input_SafetySettingParam: {
            method?: ("severity" | "probability") | string;
            threshold: ("block_low_and_above" | "block_medium_and_above" | "block_only_high" | "block_none" | "off") | string;
            type: ("hate_speech" | "dangerous_content" | "harassment" | "sexually_explicit" | "civic_integrity" | "image_hate" | "image_dangerous_content" | "image_harassment" | "image_sexually_explicit" | "jailbreak") | string;
        };
        Input_SmartTranscriptionModeParam: {
            
            type: "smart";
        };
        Input_SpeakerConfigParam: {
            speakers?: components["schemas"]["Input_SpeechConfigParam"][];
        };
        Input_SpeechAnnotationParam: {
            end_index?: number;
            speaker?: string;
            start_index?: number;
            style?: string;
            
            type: "speech_metadata";
        };
        Input_SpeechConfigParam: {
            language?: string;
            speaker?: string;
            voice?: string;
        };
        Input_SpeechConfigUnionParam: components["schemas"]["Input_SpeakerConfigParam"] | components["schemas"]["Input_SpeechConfigParam"][];
        Input_StaticMediaProcessingParam: {
            end_offset?: string;
            fps?: number;
            start_offset?: string;
            
            type: "static";
        };
        Input_TextContentParam: {
            annotations?: components["schemas"]["Input_AnnotationParam"][];
            text: string;
            
            type: "text";
        };
        Input_TextResponseFormatParam: {
            mime_type?: ("application/json" | "text/plain") | string;
            schema_?: {
                [key: string]: unknown;
            };
            
            type: "text";
        };
        Input_ToolChoiceConfigParam: {
            allowed_tools?: components["schemas"]["Input_AllowedToolsParam"];
        };
        Input_ToolChoiceParam: components["schemas"]["Input_ToolChoiceConfigParam"] | ("auto" | "any" | "none" | "validated") | string;
        Input_TranscriptionConfigModeParam: components["schemas"]["Input_TranscriptionModeParam"] | ("verbatim" | "smart") | string;
        Input_TranscriptionConfigParam: {
            adaptation_phrases?: string[];
            custom_vocabulary?: string[];
            diarization_mode?: string;
            language_codes?: string[];
            language_hints?: string[];
            mode?: components["schemas"]["Input_TranscriptionConfigModeParam"];
            timestamp_granularities?: string[];
        };
        Input_TranscriptionModeParam: components["schemas"]["Input_SmartTranscriptionModeParam"] | components["schemas"]["Input_VerbatimTranscriptionModeParam"];
        Input_URLCitationParam: {
            end_index?: number;
            start_index?: number;
            title?: string;
            
            type: "url_citation";
            url?: string;
        };
        Input_UserInputStepParam: {
            content?: components["schemas"]["Input_ContentParam"][];
            
            type: "user_input";
        };
        Input_VerbatimTranscriptionModeParam: {
            diarization_mode?: string;
            timestamp_granularities?: string[];
            
            type: "verbatim";
        };
        Input_VideoConfigParam: {
            task?: ("text_to_video" | "image_to_video" | "reference_to_video" | "edit" | "extend") | string;
        };
        Input_VideoContentParam: {
            data: string;
            mime_type?: ("video/mp4" | "video/mpeg" | "video/mpg" | "video/mov" | "video/avi" | "video/x-flv" | "video/webm" | "video/wmv" | "video/3gpp") | string;
            name?: string;
            processing?: components["schemas"]["Input_ProcessingParam"];
            resolution?: ("low" | "medium" | "high" | "ultra_high") | string;
            
            type: "video";
        };
        Input_VideoResponseFormatParam: {
            aspect_ratio?: ("16:9" | "9:16") | string;
            delivery?: ("inline" | "uri") | string;
            duration?: string;
            gcs_uri?: string;
            resolution?: ("360p" | "720p" | "1080p" | "4k") | string;
            
            type: "video";
        };
        Input_WordInfoParam: {
            end_index?: number;
            end_offset?: string;
            speaker?: string;
            start_index?: number;
            start_offset?: string;
            text?: string;
            
            type: "word_info";
        };
        InteractionRequest: {
            generation_config?: components["schemas"]["Input_GenerationConfigParam"];
            input: string | components["schemas"]["Input_ContentParam"] | components["schemas"]["Input_ContentParam"][] | components["schemas"]["Input_UserInputStepParam"][];
            
            model: "google/lyria-3-clip-preview";
            response_format?: components["schemas"]["Input_CreateModelInteractionResponseFormatParam"];
            response_mime_type?: string;
            response_modalities?: (("text" | "image" | "audio" | "video" | "document") | string)[];
            safety_settings?: components["schemas"]["Input_SafetySettingParam"][];
            stream_format?: "audio" | null;
            system_instruction?: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;

}
declare module "@lovable.dev/ai-gateway" {
  interface GeneratedModelsBySurface {
    "chat-completions": "google/gemini-2.5-flash" | "google/gemini-2.5-flash-image" | "google/gemini-2.5-flash-lite" | "google/gemini-2.5-pro" | "google/gemini-3-flash-preview" | "google/gemini-3-pro-image" | "google/gemini-3.1-flash-image" | "google/gemini-3.1-flash-lite" | "google/gemini-3.1-pro-preview" | "google/gemini-3.5-flash" | "google/gemini-3.6-flash" | "google/gemini-3.7-flash" | "google/gemini-3.8-flash" | "openai/chat-latest" | "openai/gpt-5" | "openai/gpt-5-mini" | "openai/gpt-5-nano" | "openai/gpt-5.2" | "openai/gpt-5.4" | "openai/gpt-5.4-mini" | "openai/gpt-5.4-nano" | "openai/gpt-5.5" | "openai/gpt-5.6-luna" | "openai/gpt-5.6-sol" | "openai/gpt-5.6-terra" | "openai/gpt-6-astra";
    "responses": "openai/chat-latest" | "openai/gpt-5" | "openai/gpt-5-mini" | "openai/gpt-5-nano" | "openai/gpt-5.2" | "openai/gpt-5.4" | "openai/gpt-5.4-mini" | "openai/gpt-5.4-nano" | "openai/gpt-5.4-pro" | "openai/gpt-5.5" | "openai/gpt-5.5-pro" | "openai/gpt-5.6-luna" | "openai/gpt-5.6-sol" | "openai/gpt-5.6-terra" | "openai/gpt-6-astra";
    "messages": never;
    "interactions": never;
    "image-generation": "google/gemini-2.5-flash-image" | "google/gemini-3-pro-image" | "google/gemini-3.1-flash-image" | "google/gemini-3.1-flash-lite-image" | "openai/gpt-image-1-mini" | "openai/gpt-image-2" | "openai/gpt-image-2.5-sunburst";
    "image-edit": "openai/gpt-image-1-mini" | "openai/gpt-image-2" | "openai/gpt-image-2.5-sunburst";
    "embeddings": "google/gemini-embedding-001" | "google/gemini-embedding-2" | "openai/text-embedding-3-large" | "openai/text-embedding-3-small";
    "speech": "google/gemini-2.5-flash-lite-preview-tts" | "google/gemini-2.5-flash-tts" | "google/gemini-2.5-pro-tts" | "google/gemini-3.1-flash-tts-preview" | "openai/gpt-4o-mini-tts";
    "transcription": "google/gemini-3.5-transcribe" | "openai/gpt-4o-mini-transcribe" | "openai/gpt-4o-transcribe";
    "music": "google/lyria-3-clip-preview";
    "videos": "google/gemini-omni-1.1-flash" | "google/veo-3.1" | "google/veo-3.1-fast" | "google/veo-3.1-lite";
    "systemone": never;
    "live": never;
  }
  interface ImageFieldsByModel {
    "openai/gpt-image-2.5-sunburst": ModelContract_22a58a07375a37a1.components["schemas"]["ImageGenerationRequest"];
  }
  interface ImageEditFieldsByModel {
    "openai/gpt-image-2.5-sunburst": ModelContract_22a58a07375a37a1.components["schemas"]["ImageEditRequest"];
  }
  interface ImageResponseByModel {
    "openai/gpt-image-2.5-sunburst": ModelContract_22a58a07375a37a1.components["schemas"]["ImageGenerationResponse"];
  }
  interface ImageEditResponseByModel {
    "openai/gpt-image-2.5-sunburst": ModelContract_22a58a07375a37a1.components["schemas"]["ImageEditResponse"];
  }
  interface ImageEventByModel {
    "openai/gpt-image-2.5-sunburst": ModelContract_22a58a07375a37a1.components["schemas"]["ImageGenerationEvent"];
  }
  interface ImageEditEventByModel {
    "openai/gpt-image-2.5-sunburst": ModelContract_22a58a07375a37a1.components["schemas"]["ImageEditEvent"];
  }
  interface MusicFieldsByModel {
    "google/lyria-3-clip-preview": ModelContract_3c51f8f48d09c1e0.components["schemas"]["InteractionRequest"];
  }
  interface MusicResponseByModel {
    "google/lyria-3-clip-preview": ModelContract_3c51f8f48d09c1e0.components["schemas"]["AudioResponse"];
  }
}
