import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    image: { type: String },
  },
  { timestamps: true }
);

export type User = InferSchemaType<typeof UserSchema>;

export const UserModel: Model<User> =
  (models.User as Model<User>) || model<User>("User", UserSchema);
