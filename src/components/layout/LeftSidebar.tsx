import type { ComponentProps } from 'react';
import { Sidebar } from '../Sidebar';
import { useNovelStore } from '../../store/useNovelStore';

type LeftSidebarProps = ComponentProps<typeof Sidebar>;

export function LeftSidebar(props: LeftSidebarProps) {
  const leftSidebarOpen = useNovelStore((state) => state.leftSidebarOpen);

  return (
    <div className={`workspace-sidebar workspace-sidebar-left ${leftSidebarOpen ? '' : 'workspace-sidebar-hidden'}`}>
      <Sidebar {...props} />
    </div>
  );
}
