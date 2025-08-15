'use client';

import { DefaultChatTransport } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useEffect, useState } from 'react';
import { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import { fetchWithErrorHandlers, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { toast } from './toast';
import type { Session } from 'next-auth';
import { useSearchParams } from 'next/navigation';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { useAutoResume } from '@/hooks/use-auto-resume';
import { ChatSDKError } from '@/lib/errors';
import type { Attachment, ChatMessage } from '@/lib/types';
import { useDataStream } from './data-stream-provider';
import { TrainingSidebar } from './training-sidebar';
import type { TrainerState } from '@/lib/trainer-state';

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  session,
  autoResume,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session;
  autoResume: boolean;
}) {
  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();
  const { dataStream, setDataStream } = useDataStream();

  const [input, setInput] = useState<string>('');
  const [trainingState, setTrainingState] = useState<TrainerState | null>(null);
  const [evaluations, setEvaluations] = useState<Record<string, any>>({});

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    experimental_throttle: 100,
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest({ messages, id, body }) {
        return {
          body: {
            id,
            message: messages.at(-1),
            selectedChatModel: initialChatModel,
            selectedVisibilityType: visibilityType,
            ...body,
          },
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
      
      // Handle training-specific data
      if ((dataPart as any).type === 'data-custom' && (dataPart as any).data) {
        const customData = (dataPart as any).data;
        
        if (customData.type === 'trainingState') {
          setTrainingState(customData.data);
        } else if (customData.type === 'evaluation') {
          // Store evaluation for the last message
          const lastMessage = messages[messages.length - 1];
          if (lastMessage) {
            setEvaluations(prev => ({
              ...prev,
              [lastMessage.id]: customData.data
            }));
          }
          
          // Show evaluation feedback as toasts
          const evalData = customData.data;
          if (evalData.risk_flags?.length > 0) {
            evalData.risk_flags.forEach((flag: string) => {
              if (flag === 'irresponsible_serving') {
                toast({
                  type: 'error',
                  description: 'Warning: Violation of responsible serving principles!'
                });
              } else if (flag === 'discount_only_focus') {
                toast({
                  type: 'error',
                  description: 'Too much focus on discounts. Balance sales and brand image!'
                });
              } else if (flag === 'unrealistic_promise') {
                toast({
                  type: 'error',
                  description: 'Unrealistic promises. Be honest with the client!'
                });
              }
            });
          }
          
          // Show action drill as success toast
          if (evalData.action_drill) {
            toast({
              type: 'success',
              description: `💡 ${evalData.action_drill}`
            });
          }
        } else if (customData.type === 'trainingComplete') {
          toast({
            type: 'success',
            description: customData.data.message
          });
        }
      }
    },
    onFinish: () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      if (error instanceof ChatSDKError) {
        toast({
          type: 'error',
          description: error.message,
        });
      }
    },
  });

  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: 'user' as const,
        parts: [{ type: 'text', text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, '', `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  // MVP: Voting disabled - no authentication
  const votes = undefined;

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

  return (
    <>
      <div className="flex h-dvh bg-background">
        <div className="flex flex-col min-w-0 flex-1">
          <ChatHeader
            chatId={id}
            selectedModelId={initialChatModel}
            selectedVisibilityType={initialVisibilityType}
            isReadonly={isReadonly}
            session={session}
          />

          <Messages
            chatId={id}
            status={status}
            votes={votes}
            messages={messages.map(msg => ({
              ...msg,
              evaluation: evaluations[msg.id]
            }))}
            setMessages={setMessages}
            regenerate={regenerate}
            isReadonly={isReadonly}
            isArtifactVisible={isArtifactVisible}
          />

          <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
            {!isReadonly && (
              <MultimodalInput
                chatId={id}
                input={input}
                setInput={setInput}
                status={status}
                stop={stop}
                attachments={attachments}
                setAttachments={setAttachments}
                messages={messages}
                setMessages={setMessages}
                sendMessage={sendMessage}
                selectedVisibilityType={visibilityType}
              />
            )}
          </form>
        </div>
        
        {trainingState && <TrainingSidebar state={trainingState} />}
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        status={status}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        sendMessage={sendMessage}
        messages={messages}
        setMessages={setMessages}
        regenerate={regenerate}
        votes={votes}
        isReadonly={isReadonly}
        selectedVisibilityType={visibilityType}
      />
    </>
  );
}
