PLACEHOLDER
function SignUp() {
  const nav = useNavigate();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", company: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const score = useMemo(() => scorePassword(form.password), [form.password]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    toast.success("Account created. Check your inbox to verify.");
    nav({ to: "/auth/verify-email" });
  };

  return (
    <AuthLayout
      eyebrow="Create your account"
      title="Join Office & Co."
      subtitle="Get access to the portal, community, and all branches."
      footer={<>Already have an account? <Link to="/auth/sign-in" className="text-brand font-medium hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="firstName">First name</Label><Input id="firstName" required placeholder="Anthony" value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor="lastName">Last name</Label><Input id="lastName" required placeholder="Manas" value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="email">Work email</Label><Input id="email" type="email" required placeholder="you@company.com" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="company">Company</Label><Input id="company" required placeholder="Your company" value={form.company} onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="At least 8 characters" />
          <Progress value={score} className="h-1 mt-1" />
          <div className="text-[11px] text-muted-foreground">{score < 50 ? "Weak" : score < 75 ? "Good" : "Strong"} — mix letters, numbers and symbols.</div>
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <Checkbox required className="mt-0.5" /> I agree to the <a href="#" className="text-brand">Terms</a> and <a href="#" className="text-brand">Privacy Policy</a>.
        </label>
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Creating account…" : "Create account"}</Button>
      </form>
    </AuthLayout>
  );
}
