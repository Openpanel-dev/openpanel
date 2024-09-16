'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/utils/cn';
import { useEffect, useState } from 'react';

interface JoinWaitlistProps {
  className?: string;
}

export function JoinWaitlist({ className }: JoinWaitlistProps) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      // @ts-ignore
      window.op('event', 'waitlist_success');
    }
  }, [open]);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Thanks so much!</DialogTitle>
            <DialogDescription>
              You&apos;re now on the waiting list. We&apos;ll let you know when
              we&apos;re ready. Should be within a month or two 🚀
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Got it!</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <form
        className="w-full max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          fetch('/api/waitlist', {
            method: 'POST',
            body: JSON.stringify({ email: value }),
            headers: {
              'Content-Type': 'application/json',
            },
          }).then((res) => {
            if (res.ok) {
              setOpen(true);
            }
          });
        }}
      >
        <div className="relative w-full">
          <input
            placeholder="Enter your email"
            className={cn(
              'text-blue-darker h-12 w-full rounded-md border border-slate-100 bg-white px-4 shadow-sm outline-none ring-black focus:ring-1',
              className,
            )}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" className="absolute right-1 top-1">
            Join waitlist
          </Button>
        </div>
      </form>
    </>
  );
}
