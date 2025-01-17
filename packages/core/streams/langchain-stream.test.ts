import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  LangChainStream,
  StreamingTextResponse,
  createStreamDataTransformer,
  experimental_StreamData,
} from '.';
import { openaiChatCompletionChunks } from '../tests/snapshots/openai-chat';
import { DEFAULT_TEST_URL, createMockServer } from '../tests/utils/mock-server';
import { readAllChunks } from '../tests/utils/mock-client';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { PromptTemplate } from 'langchain/prompts';
import { HumanMessage } from 'langchain/schema';
import { BytesOutputParser } from 'langchain/schema/output_parser';

const server = createMockServer(
  [
    {
      url: DEFAULT_TEST_URL + 'chat/completions',
      chunks: openaiChatCompletionChunks,
      formatChunk: chunk => `data: ${JSON.stringify(chunk)}\n\n`,
      suffix: 'data: [DONE]',
    },
  ],
  // passthrough urls:
  ['https://tiktoken.pages.dev/js/cl100k_base.json'],
);

describe('LangchainStream', () => {
  beforeAll(() => {
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  describe('LangChain Expression Language call', () => {
    it('should be able to parse SSE and receive the streamed response', async () => {
      const model = new ChatOpenAI({
        streaming: true,
        openAIApiKey: 'fake',
        configuration: { baseURL: DEFAULT_TEST_URL },
      });

      const stream = await PromptTemplate.fromTemplate('{input}')
        .pipe(model)
        .pipe(new BytesOutputParser())
        .stream({ input: 'Hello' });

      const response = new StreamingTextResponse(stream);

      expect(await readAllChunks(response)).toEqual([
        '',
        'Hello',
        ',',
        ' world',
        '.',
        '',
      ]);
    });

    describe('StreamData protocol', () => {
      it('should send text', async () => {
        const data = new experimental_StreamData();

        const model = new ChatOpenAI({
          streaming: true,
          openAIApiKey: 'fake',
          configuration: { baseURL: DEFAULT_TEST_URL },
        });

        const stream = await PromptTemplate.fromTemplate('{input}')
          .pipe(model)
          .pipe(new BytesOutputParser())
          .stream(
            { input: 'Hello' },
            {
              callbacks: [
                {
                  handleChainEnd(outputs, runId, parentRunId) {
                    // check that main chain (without parent) is finished:
                    if (parentRunId == null) {
                      data.close();
                    }
                  },
                },
              ],
            },
          );

        const response = new StreamingTextResponse(
          stream.pipeThrough(createStreamDataTransformer(true)),
          {},
          data,
        );

        expect(await readAllChunks(response)).toEqual([
          '0:""\n',
          '0:"Hello"\n',
          '0:","\n',
          '0:" world"\n',
          '0:"."\n',
          '0:""\n',
        ]);
      });

      it('should send text and data', async () => {
        const data = new experimental_StreamData();

        data.append({ t1: 'v1' });

        const model = new ChatOpenAI({
          streaming: true,
          openAIApiKey: 'fake',
          configuration: { baseURL: DEFAULT_TEST_URL },
        });

        const stream = await PromptTemplate.fromTemplate('{input}')
          .pipe(model)
          .pipe(new BytesOutputParser())
          .stream(
            { input: 'Hello' },
            {
              callbacks: [
                {
                  handleChainEnd(outputs, runId, parentRunId) {
                    // check that main chain (without parent) is finished:
                    if (parentRunId == null) {
                      data.close();
                    }
                  },
                },
              ],
            },
          );

        const response = new StreamingTextResponse(
          stream.pipeThrough(createStreamDataTransformer(true)),
          {},
          data,
        );

        expect(await readAllChunks(response)).toEqual([
          '2:[{"t1":"v1"}]\n',
          '0:""\n',
          '0:"Hello"\n',
          '0:","\n',
          '0:" world"\n',
          '0:"."\n',
          '0:""\n',
        ]);
      });
    });
  });

  describe('LangChain LLM call', () => {
    it('should be able to parse SSE and receive the streamed response', async () => {
      const { stream, handlers } = LangChainStream();

      const llm = new ChatOpenAI({
        streaming: true,
        openAIApiKey: 'fake',
        configuration: { baseURL: DEFAULT_TEST_URL },
      });

      llm
        .call([new HumanMessage('hello')], {}, [handlers])
        .catch(console.error);

      const response = new StreamingTextResponse(stream);

      expect(await readAllChunks(response)).toEqual([
        '',
        'Hello',
        ',',
        ' world',
        '.',
        '',
      ]);
    });

    describe('StreamData prototcol', () => {
      it('should send text', async () => {
        const data = new experimental_StreamData();

        const { stream, handlers } = LangChainStream({
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        });

        const llm = new ChatOpenAI({
          streaming: true,
          openAIApiKey: 'fake',
          configuration: { baseURL: DEFAULT_TEST_URL },
        });

        llm
          .call([new HumanMessage('hello')], {}, [handlers])
          .catch(console.error);

        const response = new StreamingTextResponse(stream, {}, data);

        expect(await readAllChunks(response)).toEqual([
          '0:""\n',
          '0:"Hello"\n',
          '0:","\n',
          '0:" world"\n',
          '0:"."\n',
          '0:""\n',
        ]);
      });

      it('should send text and data', async () => {
        const data = new experimental_StreamData();

        data.append({ t1: 'v1' });

        const { stream, handlers } = LangChainStream({
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        });

        const llm = new ChatOpenAI({
          streaming: true,
          openAIApiKey: 'fake',
          configuration: { baseURL: DEFAULT_TEST_URL },
        });

        llm
          .call([new HumanMessage('hello')], {}, [handlers])
          .catch(console.error);

        const response = new StreamingTextResponse(stream, {}, data);

        expect(await readAllChunks(response)).toEqual([
          '2:[{"t1":"v1"}]\n',
          '0:""\n',
          '0:"Hello"\n',
          '0:","\n',
          '0:" world"\n',
          '0:"."\n',
          '0:""\n',
        ]);
      });
    });
  });
});
