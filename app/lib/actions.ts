'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import postgres from 'postgres';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const FormSchema = z.object({
	id: z.string(),
	customerId: z.string({
		invalid_type_error: 'Please select a customer'
	}),
	amount: z.coerce.number().gt(0, { message: 'Please enter an amount greater than $0' }),
	status: z.enum(['pending', 'paid'], {
		invalid_type_error: 'Please select an invoice status'
	}),
	date: z.string()
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
	errors?: {
		customerId?: string[];
		amount?: string[];
		status?: string[];
	};
	message?: string | null;
	fields?: {
		customerId?: string;
		amount?: string;
		status?: string;
	}
}

export async function authenticate(prevState: string | undefined, formData: FormData) {
	try {
		await signIn('credentials', formData);
	} catch(error) {
		if (error instanceof AuthError) {
			console.log(error);
			switch (error.type) {
				case 'CredentialsSignin':
					return 'Invalid credentials.';
				default:
					return 'Something went wrong';
			}
		}
		throw error;
	}
}

export async function createInvoice(prevState: State, formData: FormData) {
	// Collect form values
	const fieldValues = {
		customerId: formData.get('customerId')?.toString() || '',
		amount: formData.get('amount')?.toString() || '',
		status: formData.get('status')?.toString() || ''
	}

	// Validate form using zod
	const validatedFields = CreateInvoice.safeParse({
		customerId: fieldValues.customerId,
		amount: fieldValues.amount,
		status: fieldValues.status
	});

	// If form validation fails, return errors early. Otherwise, continue
	if (!validatedFields.success) {
		return {
			errors: validatedFields.error.flatten().fieldErrors,
			message: 'Missing Fields. Failed to Create Invoice',
			fields: fieldValues
		};
	}
	console.log(validatedFields.data);
	// Prepare data for insertion into the database
	const { customerId, amount, status } = validatedFields.data;
	const amountInCents = amount * 100;
	const date = new Date().toISOString().split('T')[0];

	// Insert data into the database
	try {
		await sql`
			INSERT INTO invoices (customer_id, amount, status, date)
			VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
		`;
	} catch (error) {
		// If a database error occurs, return a more specific error
		return {
      message: 'Database Error: Failed to Create Invoice',
      fields: fieldValues
		};
	}
	
	// Revalidate the cache for the invoices page and redirect the user
	revalidatePath('/dashboard/invoices');
	redirect('/dashboard/invoices');
}

export async function updateInvoice(id: string, prevState: State, formData: FormData) {
	// Collect form values
	const fieldValues = {
		customerId: formData.get('customerId')?.toString() || '',
		amount: formData.get('amount')?.toString() || '',
		status: formData.get('status')?.toString() || ''
	}

	// Validate form using zod
	const validatedFields = UpdateInvoice.safeParse({
		customerId: fieldValues.customerId,
		amount: fieldValues.amount,
		status: fieldValues.status
	});

	// If form validation fails, return errors early. Otherwise, continue
	if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
      fields: fieldValues
    };
  }

  // Prepare data for insertion into the database
  const { customerId, amount, status } = validatedFields.data;
	const amountInCents = amount * 100;

	// Update invoice in database
	try {
		await sql`
			UPDATE invoices
			SET customer_id = ${customerId}, amount=${amountInCents}, status=${status}
			WHERE id = ${id}
		`;	
	} catch (error) {
		// If a database error occurs, return a more specific error
		return {
			message: 'Database Error: Failed to Update Invoice',
			fields: fieldValues
		};
	}
	
	// Revalidate the cache for the invoices page and redirect the user
	revalidatePath('/dashboard/invoices');
	redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {


	await sql`DELETE FROM invoices WHERE id = ${id}`;
	revalidatePath('/dashboard/invoices');
}