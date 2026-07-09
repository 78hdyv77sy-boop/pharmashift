import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Ungültige E-Mail-Adresse"),
  password: z.string().min(1, "Passwort erforderlich"),
});

export const registerSchema = z
  .object({
    name: z.string().min(2, "Name zu kurz"),
    email: z.string().email("Ungültige E-Mail-Adresse"),
    password: z
      .string()
      .min(8, "Mindestens 8 Zeichen")
      .regex(/[A-Z]/, "Mindestens ein Großbuchstabe")
      .regex(/[0-9]/, "Mindestens eine Zahl"),
    confirmPassword: z.string(),
    orgName: z.string().min(2, "Name der Apotheke/Organisation erforderlich"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwörter stimmen nicht überein",
    path: ["confirmPassword"],
  });

export const requestResetSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse"),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8, "Mindestens 8 Zeichen"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwörter stimmen nicht überein",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
