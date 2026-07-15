/**
 * Forum Model
 *
 * Handles both public (open to all organization members) and private
 * (direct 1:1 or small-group) conversations.
 *
 * Public threads are visible to every member of the organization.
 * Private threads are only visible to the participants listed in the
 * `participants` array.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// ---------------------------------------------------------------------------
// TypeScript Interfaces
// ---------------------------------------------------------------------------

export interface IForumMessage extends Document {
  _id: mongoose.Types.ObjectId;
  threadId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IForumThread extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  type: 'public' | 'private';
  title: string; // required for public threads; optional display for private
  createdBy: mongoose.Types.ObjectId;
  participants: mongoose.Types.ObjectId[]; // relevant for private threads
  isPinned: boolean;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Forum Thread Schema
// ---------------------------------------------------------------------------

const forumThreadSchema = new Schema<IForumThread>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: [true, 'Organization is required'],
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: ['public', 'private'],
        message: '{VALUE} is not a valid thread type',
      },
      required: [true, 'Thread type is required'],
      index: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator is required'],
    },
    participants: {
      type: [Schema.Types.ObjectId],
      ref: 'User',
      default: [],
      validate: {
        validator: function (this: IForumThread, v: mongoose.Types.ObjectId[]) {
          // Private threads MUST have at least 2 participants (creator + another)
          if (this.type === 'private') return v.length >= 2;
          return true;
        },
        message: 'Private threads must have at least 2 participants',
      },
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: any, ret: any) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound index for efficient thread listing per org
forumThreadSchema.index({ organizationId: 1, type: 1, lastMessageAt: -1 });

// ---------------------------------------------------------------------------
// Forum Message Schema
// ---------------------------------------------------------------------------

const forumMessageSchema = new Schema<IForumMessage>(
  {
    threadId: {
      type: Schema.Types.ObjectId,
      ref: 'ForumThread',
      required: [true, 'Thread is required'],
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender is required'],
    },
    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
      maxlength: 5000,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: any, ret: any) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

forumMessageSchema.index({ threadId: 1, createdAt: 1 });

// ---------------------------------------------------------------------------
// Model Exports
// ---------------------------------------------------------------------------

export const ForumThread: Model<IForumThread> =
  mongoose.models.ForumThread ||
  mongoose.model<IForumThread>('ForumThread', forumThreadSchema);

export const ForumMessage: Model<IForumMessage> =
  mongoose.models.ForumMessage ||
  mongoose.model<IForumMessage>('ForumMessage', forumMessageSchema);