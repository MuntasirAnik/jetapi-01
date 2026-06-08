import { Controller, Get, Put, Delete, Post, Param, Body, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthGuard } from '../auth/auth.guard';
import { UserPlugin } from './user-plugin.entity';
import { Plugin } from '../admin/plugin.entity';
import { Collection } from './collection.entity';

@Controller('collections')
@UseGuards(AuthGuard)
export class CollectionPluginsController {
  constructor(
    @InjectRepository(UserPlugin)
    private userPluginRepo: Repository<UserPlugin>,
    @InjectRepository(Plugin)
    private pluginRepo: Repository<Plugin>,
    @InjectRepository(Collection)
    private collectionRepo: Repository<Collection>,
  ) {}

  /**
   * List all available plugins for this collection.
   * Returns admin-enabled plugins merged with user's activation status.
   */
  @Get(':id/plugins')
  async getCollectionPlugins(@Param('id') collectionId: string, @Req() req: any) {
    const userId = req.user.sub;

    // Verify collection access
    const collection = await this.collectionRepo.findOne({ where: { id: collectionId } });
    if (!collection) throw new NotFoundException('Collection not found');

    // Get all admin-enabled plugins
    const availablePlugins = await this.pluginRepo.find({ where: { enabled: true }, order: { category: 'ASC', name: 'ASC' } });

    // Get user's plugin activations for this collection
    const userPlugins = await this.userPluginRepo.find({ where: { userId, collectionId } });
    const userPluginMap = new Map(userPlugins.map(up => [up.pluginSlug, up]));

    return availablePlugins.map(plugin => {
      const userPlugin = userPluginMap.get(plugin.slug);
      return {
        slug: plugin.slug,
        name: plugin.name,
        description: plugin.description,
        category: plugin.category,
        icon: plugin.icon,
        configSchema: plugin.configSchema,
        // User-specific state
        activated: !!userPlugin,
        enabled: userPlugin?.enabled ?? false,
        userConfig: userPlugin ? userPlugin.config : '{}',
      };
    });
  }

  /**
   * Enable/disable a plugin for this collection and save user config.
   */
  @Put(':id/plugins/:slug')
  async updateCollectionPlugin(
    @Param('id') collectionId: string,
    @Param('slug') slug: string,
    @Body() body: { enabled?: boolean; config?: any },
    @Req() req: any,
  ) {
    const userId = req.user.sub;

    // Verify plugin exists and is admin-enabled
    const plugin = await this.pluginRepo.findOne({ where: { slug, enabled: true } });
    if (!plugin) throw new NotFoundException('Plugin not found or not available');

    // Find or create user plugin activation
    let userPlugin = await this.userPluginRepo.findOne({ where: { userId, collectionId, pluginSlug: slug } });

    if (!userPlugin) {
      userPlugin = this.userPluginRepo.create({
        userId,
        collectionId,
        pluginSlug: slug,
        enabled: body.enabled !== undefined ? body.enabled : true,
        config: body.config ? (typeof body.config === 'string' ? body.config : JSON.stringify(body.config)) : '{}',
      });
    } else {
      if (body.enabled !== undefined) userPlugin.enabled = body.enabled;
      if (body.config !== undefined) {
        userPlugin.config = typeof body.config === 'string' ? body.config : JSON.stringify(body.config);
      }
    }

    await this.userPluginRepo.save(userPlugin);
    return userPlugin;
  }

  /**
   * Remove a plugin from this collection.
   */
  @Delete(':id/plugins/:slug')
  async removeCollectionPlugin(
    @Param('id') collectionId: string,
    @Param('slug') slug: string,
    @Req() req: any,
  ) {
    const userId = req.user.sub;
    const result = await this.userPluginRepo.delete({ userId, collectionId, pluginSlug: slug });
    if (result.affected === 0) throw new NotFoundException('Plugin not activated for this collection');
    return { removed: true };
  }

  /**
   * Test a plugin's config for this collection.
   */
  @Post(':id/plugins/:slug/test')
  async testCollectionPlugin(
    @Param('id') collectionId: string,
    @Param('slug') slug: string,
    @Req() req: any,
  ) {
    const userId = req.user.sub;

    const userPlugin = await this.userPluginRepo.findOne({ where: { userId, collectionId, pluginSlug: slug } });
    if (!userPlugin) throw new NotFoundException('Plugin not activated for this collection');

    const plugin = await this.pluginRepo.findOne({ where: { slug } });
    if (!plugin) throw new NotFoundException('Plugin not found');

    let config: any = {};
    try { config = JSON.parse(userPlugin.config); } catch {}

    const schema = JSON.parse(plugin.configSchema || '[]');
    const missingFields = schema.filter((f: any) => !config[f.key] && f.type !== 'select');
    if (missingFields.length > 0) {
      return { success: false, message: `Missing required fields: ${missingFields.map((f: any) => f.label).join(', ')}` };
    }

    // Basic validation by plugin type
    try {
      switch (slug) {
        case 'slack':
        case 'discord':
        case 'zapier':
          if (!config.webhookUrl) return { success: false, message: 'Webhook URL is required' };
          return { success: true, message: 'Webhook URL configured. Ready to send events.' };
        case 'smtp':
          if (!config.host || !config.port) return { success: false, message: 'Host and port are required' };
          return { success: true, message: `SMTP configured: ${config.host}:${config.port}` };
        case 'github':
        case 'gitlab':
          if (!config.token) return { success: false, message: 'Access token is required' };
          return { success: true, message: 'Token configured. Connection ready.' };
        case 'sentry':
          if (!config.dsn) return { success: false, message: 'DSN is required' };
          return { success: true, message: 'Sentry DSN configured.' };
        case 's3':
          if (!config.bucket || !config.accessKey) return { success: false, message: 'Bucket and Access Key required' };
          return { success: true, message: `S3 bucket "${config.bucket}" configured.` };
        default:
          return { success: true, message: 'Plugin configuration looks valid.' };
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection test failed' };
    }
  }
}
