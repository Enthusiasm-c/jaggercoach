import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { Chat } from '@/components/chat';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { DataStreamHandler } from '@/components/data-stream-handler';

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;

  // MVP: Create mock session and chat data
  const session = {
    user: {
      id: 'mvp-user-' + Date.now(),
      email: 'mvp@test.com',
      name: 'MVP User',
      type: 'regular' as const
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };

  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get('chat-model');
  const selectedModelId = modelIdFromCookie?.value || DEFAULT_CHAT_MODEL;

  return (
    <>
      <Chat
        key={id}
        id={id}
        initialMessages={[]}
        initialChatModel={selectedModelId}
        initialVisibilityType="private"
        isReadonly={false}
        session={session as any}
        autoResume={false}
      />
      <DataStreamHandler />
    </>
  );
}