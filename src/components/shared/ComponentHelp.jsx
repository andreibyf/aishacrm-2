import React from 'react';
import { PlayCircle, HelpCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * ComponentHelp
 * 
 * A small trigger button (Play icon) that opens a video dialog.
 * Place this next to section headers or complex components.
 * 
 * @param {string} title - Title of the help video
 * @param {string} description - Optional description
 * @param {string} videoUrl - Embed URL for the video (YouTube, Loom, Vimeo, etc.)
 * @param {string} triggerType - 'play' (default) or 'help' (question mark)
 */
export function ComponentHelp({ title, description, videoUrl, triggerType = 'play' }) {
  const Icon = triggerType === 'help' ? HelpCircle : PlayCircle;

  return (
    <Dialog>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-muted-foreground hover:text-primary ml-2"
              >
                <Icon className="h-4 w-4" />
                <span className="sr-only">Watch Help: {title}</span>
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Watch help video: {title}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        
        <div className="aspect-video w-full overflow-hidden rounded-lg border bg-muted mt-2">
          {videoUrl ? (
            <iframe
              src={videoUrl}
              className="h-full w-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              title={`Help video for ${title}`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
              <p>Video URL not provided</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
