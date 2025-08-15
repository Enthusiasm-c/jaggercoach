'use client';

import { useRouter } from 'next/navigation';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { PlusIcon } from './icons';
import { memo } from 'react';
import type { Session } from 'next-auth';

function PureChatHeader({
  chatId,
  selectedModelId,
  selectedVisibilityType,
  isReadonly,
  session,
}: {
  chatId: string;
  selectedModelId: string;
  selectedVisibilityType: string;
  isReadonly: boolean;
  session: Session;
}) {
  const router = useRouter();

  return (
    <header className="flex sticky top-0 bg-background py-1.5 items-center px-2 md:px-2 gap-2">
      <SidebarToggle />
      
      {/* App Title - centered */}
      <div className="flex-1 text-center">
        <h1 className="text-lg font-semibold">Jägermeister High 5 Training</h1>
      </div>
      
      {/* New Chat Button */}
      {!isReadonly && (
        <Button
          variant="outline"
          className="px-2 py-2 h-fit"
          onClick={() => {
            router.push('/');
            router.refresh();
          }}
        >
          <PlusIcon />
          <span className="sr-only">New Chat</span>
        </Button>
      )}
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader);