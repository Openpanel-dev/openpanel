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
import Link from 'next/link';

interface JoinWaitlistProps {
  className?: string;
}

export function JoinWaitlistHero({ className }: JoinWaitlistProps) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      // @ts-ignore
      window.openpanel.event('waitlist_open');
    }
  }, [open]);

  useEffect(() => {
    if (success) {
      // @ts-ignore
      window.openpanel.event('waitlist_success', {
        email: value,
      });
    }
  }, [success]);

  const renderSuccess = () => (
    <DialogContent className="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Thanks so much!</DialogTitle>
        <DialogDescription>
          You're now on the waiting list. We'll let you know when we're ready.
          Should be within a month or two 🚀
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button onClick={() => setOpen(false)}>Got it!</Button>
      </DialogFooter>
    </DialogContent>
  );

  const renderForm = () => (
    <DialogContent className="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Almost there!</DialogTitle>
        <DialogDescription>
          Enter your email to join the waiting list. We'll let you know when
          we're ready.
        </DialogDescription>
      </DialogHeader>

      <form
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
              setSuccess(true);
            }
          });
        }}
      >
        <div className="relative w-full">
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
    </DialogContent>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {success ? renderSuccess() : renderForm()}
      </Dialog>
      <div className="flex gap-4">
        <Button
          size="lg"
          className="text-lg h-12"
          onClick={() => {
            setOpen(true);
          }}
        >
          Join waitlist now
        </Button>
        <Link
          href="https://dashboard.openpanel.dev/share/overview/ZQsEhG"
          target="_blank"
          rel="nofollow"
        >
          <Button size="lg" variant="outline" className="text-lg h-12">
            Demo
          </Button>
        </Link>
      </div>
    </>
  );
}
