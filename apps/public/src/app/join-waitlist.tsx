'use client';

import { useEffect, useState } from 'react';
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

interface JoinWaitlistProps {
  className?: string;
}

export function JoinWaitlist({ className }: JoinWaitlistProps) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      // @ts-ignore
      window.openpanel.event('waitlist_success');
    }
  }, [open]);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Thanks so much!</DialogTitle>
            <DialogDescription>
              You're now on the waiting list. We'll let you know when we're
              ready. Should be within a month or two 🚀
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
        <div className="relative w-full mb-8">
          <input
            placeholder="Enter your email"
            className={cn(
              'border border-slate-100 rounded-md shadow-sm bg-white h-12 w-full px-4 outline-none focus:ring-1 ring-black text-blue-darker',
              className
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
